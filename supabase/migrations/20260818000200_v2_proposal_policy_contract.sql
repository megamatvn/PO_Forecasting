-- Move proposal approval policy state off the legacy approval engine before
-- the controlled cutover removes that engine.  This migration is idempotent
-- for databases that already replayed 20260817000600 with the old contract.

do $$ begin
  create type public.proposal_approval_mode_v2 as enum ('fixed_two_level', 'threshold');
exception when duplicate_object then null; end $$;

create table if not exists public.proposal_approval_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  mode public.proposal_approval_mode_v2 not null default 'fixed_two_level',
  threshold_amount numeric(20, 2),
  currency_code text not null default 'EUR'
    check (currency_code = upper(currency_code) and length(currency_code) = 3),
  version integer not null default 1 check (version > 0),
  effective_from date not null default current_date,
  effective_to date,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (
    (mode = 'fixed_two_level' and threshold_amount is null)
    or (mode = 'threshold' and threshold_amount is not null and threshold_amount >= 0)
  ),
  check (not is_default or mode = 'fixed_two_level')
);

create unique index if not exists proposal_approval_policies_one_active_default_idx
  on public.proposal_approval_policies (is_default)
  where is_default and is_active;

create table if not exists public.proposal_approval_policy_brands (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.proposal_approval_policies(id),
  brand_id uuid not null references public.brands(id),
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists proposal_approval_policy_brands_brand_period_idx
  on public.proposal_approval_policy_brands (brand_id, effective_from, effective_to)
  where is_active;
create index if not exists proposal_approval_policy_brands_policy_id_idx
  on public.proposal_approval_policy_brands (policy_id);

alter table public.proposal_approval_policies enable row level security;
alter table public.proposal_approval_policy_brands enable row level security;
drop policy if exists proposal_approval_policies_select_admin on public.proposal_approval_policies;
create policy proposal_approval_policies_select_admin
  on public.proposal_approval_policies for select to authenticated
  using (public.current_user_is_administrator_v2());
drop policy if exists proposal_approval_policy_brands_select_admin on public.proposal_approval_policy_brands;
create policy proposal_approval_policy_brands_select_admin
  on public.proposal_approval_policy_brands for select to authenticated
  using (public.current_user_is_administrator_v2());

do $$
begin
  if to_regclass('public.approval_policies') is not null then
    insert into public.proposal_approval_policies (
      id, name, mode, threshold_amount, currency_code, version,
      effective_from, effective_to, is_default, is_active, created_by,
      created_at, updated_at
    )
    select
      p.id, p.name, p.mode::text::public.proposal_approval_mode_v2,
      p.threshold_amount, p.currency_code, p.version,
      p.effective_from, p.effective_to, p.is_default, p.is_active,
      p.created_by, p.created_at, p.updated_at
    from public.approval_policies p
    on conflict (id) do nothing;
  end if;
  if to_regclass('public.approval_policy_brands') is not null then
    insert into public.proposal_approval_policy_brands (
      id, policy_id, brand_id, effective_from, effective_to, is_active,
      created_by, created_at
    )
    select
      pb.id, pb.policy_id, pb.brand_id, pb.effective_from, pb.effective_to,
      pb.is_active, pb.created_by, pb.created_at
    from public.approval_policy_brands pb
    on conflict (id) do nothing;
  end if;
end;
$$;

alter table public.purchase_proposals
  drop constraint if exists purchase_proposals_policy_id_fkey;
alter table public.purchase_proposals
  add constraint purchase_proposals_policy_id_fkey
  foreign key (policy_id) references public.proposal_approval_policies(id);

alter table public.proposal_route_snapshots
  drop constraint if exists proposal_route_snapshots_policy_id_fkey;
alter table public.proposal_route_snapshots
  add constraint proposal_route_snapshots_policy_id_fkey
  foreign key (policy_id) references public.proposal_approval_policies(id);

drop function if exists public.create_proposal_approval_policy_v2(
  text, public.approval_mode, numeric, text, uuid[], date, date, uuid
);

create or replace function public.create_proposal_approval_policy_v2(
  p_name text,
  p_mode public.proposal_approval_mode_v2,
  p_threshold_amount numeric,
  p_currency_code text,
  p_brand_ids uuid[],
  p_effective_from date,
  p_effective_to date,
  p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  policy_id uuid;
  target_brand_id uuid;
  request_payload jsonb;
  existing_action public.action_idempotency%rowtype;
begin
  if not public.current_profile_is_active() or not public.current_user_is_administrator_v2() then
    raise exception using errcode = '42501', message = 'PROPOSAL_POLICY_ADMIN_REQUIRED';
  end if;
  if p_idempotency_key is null
    or btrim(coalesce(p_name, '')) = ''
    or coalesce(array_length(p_brand_ids, 1), 0) = 0
    or p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from)
    or p_currency_code !~ '^[A-Z]{3}$'
    or (p_mode = 'threshold' and (p_threshold_amount is null or p_threshold_amount < 0))
    or (p_mode = 'fixed_two_level' and p_threshold_amount is not null)
  then
    raise exception using errcode = 'P0001', message = 'PROPOSAL_POLICY_INVALID';
  end if;
  request_payload := jsonb_build_object(
    'name', btrim(p_name), 'mode', p_mode,
    'thresholdAmount', p_threshold_amount, 'currencyCode', p_currency_code,
    'brandIds', to_jsonb(p_brand_ids), 'effectiveFrom', p_effective_from,
    'effectiveTo', p_effective_to
  );
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'create_proposal_approval_policy_v2'
      or existing_action.result -> 'request' <> request_payload
    then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;
  foreach target_brand_id in array p_brand_ids loop
    if not exists (select 1 from public.brands where id = target_brand_id and is_active) then
      raise exception using errcode = 'P0001', message = 'PROPOSAL_POLICY_BRAND_NOT_FOUND';
    end if;
    if not exists (
      select 1 from public.user_brand_permissions ubp
      where ubp.user_id = actor_id and ubp.brand_id = target_brand_id
        and ubp.capability = 'administer_system'::public.user_capability
    ) and not public.current_user_is_administrator_v2() then
      raise exception using errcode = '42501', message = 'PROPOSAL_POLICY_BRAND_FORBIDDEN';
    end if;
    if exists (
      select 1
      from public.proposal_approval_policy_brands pb
      join public.proposal_approval_policies policy on policy.id = pb.policy_id
      where pb.brand_id = target_brand_id and pb.is_active and policy.is_active
        and daterange(pb.effective_from, coalesce(pb.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
    ) then
      raise exception using errcode = 'P0001', message = 'PROPOSAL_POLICY_OVERLAP';
    end if;
  end loop;
  insert into public.proposal_approval_policies (
    name, mode, threshold_amount, currency_code, version,
    effective_from, effective_to, is_default, is_active, created_by
  )
  values (
    btrim(p_name), p_mode, p_threshold_amount, p_currency_code,
    coalesce((select max(version) + 1 from public.proposal_approval_policies where name = btrim(p_name)), 1),
    p_effective_from, p_effective_to, false, true, actor_id
  ) returning id into policy_id;
  foreach target_brand_id in array p_brand_ids loop
    insert into public.proposal_approval_policy_brands(
      policy_id, brand_id, effective_from, effective_to, is_active, created_by
    ) values (policy_id, target_brand_id, p_effective_from, p_effective_to, true, actor_id);
  end loop;
  request_payload := jsonb_build_object(
    'request', request_payload,
    'data', jsonb_build_object('policyId', policy_id, 'mode', p_mode, 'brandIds', to_jsonb(p_brand_ids))
  );
  perform public.write_audit_event(
    p_brand_ids[1], 'proposal_approval_policy_created', 'approval_policy',
    policy_id, p_idempotency_key, null, request_payload -> 'data', jsonb_build_object('source', 'v2')
  );
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'create_proposal_approval_policy_v2', policy_id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

create or replace function public.submit_proposal_v2(
  p_proposal_id uuid, p_expected_lock_version integer, p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.purchase_proposals%rowtype;
  current_revision_id uuid;
  policy_row public.proposal_approval_policies%rowtype;
  owner_tier public.org_tier;
  reference_amount numeric := 0;
  route public.proposal_route_kind := 'manager_then_executive';
  status_value text := 'pending_manager';
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
begin
  request_payload := jsonb_build_object('proposalId', p_proposal_id, 'expectedLockVersion', p_expected_lock_version);
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'submit_proposal_v2'
      or existing_action.created_by <> actor_id
      or existing_action.result -> 'request' <> request_payload
    then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;
  select * into proposal_row from public.purchase_proposals where id = p_proposal_id for update;
  if proposal_row.owner_id <> (select auth.uid()) or proposal_row.status not in ('draft', 'changes_requested') then
    raise exception using errcode = '42501', message = 'PROPOSAL_DRAFT_FORBIDDEN';
  end if;
  if proposal_row.lock_version <> p_expected_lock_version then
    raise exception using errcode = 'P0001', message = 'PROPOSAL_LOCK_CONFLICT';
  end if;
  select pr.id into current_revision_id from public.proposal_revisions pr
  where pr.proposal_id = p_proposal_id order by pr.revision_number desc limit 1;
  if not exists (select 1 from public.proposal_lines where proposal_revision_id = current_revision_id) then
    raise exception using errcode = 'P0001', message = 'PROPOSAL_LINES_REQUIRED';
  end if;
  select policy.* into policy_row
  from public.proposal_approval_policy_brands pb
  join public.proposal_approval_policies policy on policy.id = pb.policy_id
  where pb.brand_id = proposal_row.brand_id and pb.is_active and policy.is_active
    and current_date >= pb.effective_from
    and (pb.effective_to is null or current_date <= pb.effective_to)
    and current_date >= policy.effective_from
    and (policy.effective_to is null or current_date <= policy.effective_to)
  order by policy.version desc limit 1;
  if policy_row.id is null then
    select * into policy_row from public.proposal_approval_policies
    where is_default and is_active order by version desc limit 1;
  end if;
  if policy_row.id is null then
    route := 'manager_then_executive';
  else
    select coalesce(sum(pl.requested_qty::numeric * l.ex_price), 0) into reference_amount
    from public.proposal_lines pl
    join public.annual_plan_lines l
      on l.revision_id = proposal_row.baseline_revision_id and l.product_id = pl.product_id
    where pl.proposal_revision_id = current_revision_id;
    if policy_row.mode = 'threshold' and reference_amount < policy_row.threshold_amount then
      route := 'manager_only';
    end if;
  end if;
  select org_tier into owner_tier from public.profiles where id = proposal_row.owner_id;
  if owner_tier = 'executive' then
    status_value := 'pending_manager';
  elsif proposal_row.owner_id = proposal_row.assigned_manager_id then
    status_value := 'pending_manager';
  end if;
  update public.purchase_proposals
  set status = status_value, route_kind = route,
      route_reason = case when policy_row.mode = 'threshold' then 'threshold' else 'forced_two_level' end,
      policy_id = policy_row.id, lock_version = lock_version + 1, updated_at = now()
  where id = p_proposal_id returning * into proposal_row;
  if proposal_row.assigned_manager_id is not null and proposal_row.assigned_manager_id <> actor_id then
    perform public.enqueue_notification_v2(
      proposal_row.assigned_manager_id, proposal_row.id, 'proposal_submitted',
      'Có đề xuất mua hàng mới', 'Một đề xuất đang chờ bạn kiểm tra và ghi nhận vào PO.',
      '/proposals/' || proposal_row.id::text
    );
  end if;
  if proposal_row.assigned_executive_id is not null
    and proposal_row.assigned_executive_id <> proposal_row.assigned_manager_id
  then
    perform public.enqueue_notification_v2(
      proposal_row.assigned_executive_id, proposal_row.id, 'proposal_submitted',
      'Thông tin đề xuất mua hàng', 'CEO/BOD luôn nhận được thông tin về đề xuất mới.',
      '/proposals/' || proposal_row.id::text
    );
  end if;
  result_payload := jsonb_build_object(
    'proposalId', proposal_row.id, 'revisionId', current_revision_id,
    'status', proposal_row.status, 'route', proposal_row.route_kind,
    'referenceAmount', reference_amount
  );
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (
    p_idempotency_key, 'submit_proposal_v2', p_proposal_id,
    jsonb_build_object('request', request_payload, 'data', result_payload), actor_id
  );
  return result_payload;
end;
$$;

revoke all on table public.proposal_approval_policies, public.proposal_approval_policy_brands from anon, authenticated;
revoke all on function public.create_proposal_approval_policy_v2(text, public.proposal_approval_mode_v2, numeric, text, uuid[], date, date, uuid) from public, anon;
grant execute on function public.create_proposal_approval_policy_v2(text, public.proposal_approval_mode_v2, numeric, text, uuid[], date, date, uuid) to authenticated, service_role;
