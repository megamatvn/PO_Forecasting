-- Operational purchase proposals. Annual-plan baselines remain immutable; this
-- layer records requested units, one selected stable PO and the approval route.

do $$ begin
  create type public.proposal_route_kind as enum ('manager_only', 'manager_then_executive');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.proposal_capacity_status as enum ('held', 'consumed', 'released');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.proposal_approval_mode_v2 as enum ('fixed_two_level', 'threshold');
exception when duplicate_object then null; end $$;

-- V2 owns its proposal approval policy contract.  The legacy approval engine
-- is removed by the controlled cutover, so proposal workflows must not keep a
-- foreign key or function dependency on its tables/types.
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

create table if not exists public.purchase_proposals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  planning_year integer not null check (planning_year between 2000 and 2200),
  owner_id uuid not null references public.profiles(id),
  status text not null default 'draft' check (status in ('draft','pending_manager','pending_executive','changes_requested','approved','rejected','withdrawn','cancellation_pending_manager','cancellation_pending_executive','cancelled')),
  needed_month date not null check (needed_month = date_trunc('month', needed_month)::date),
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  baseline_revision_id uuid references public.annual_plan_revisions(id),
  assigned_manager_id uuid references public.profiles(id),
  assigned_executive_id uuid references public.profiles(id),
  policy_id uuid references public.proposal_approval_policies(id),
  route_kind public.proposal_route_kind,
  route_reason text,
  lock_version integer not null default 0 check (lock_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_revisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.purchase_proposals(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (proposal_id, revision_number)
);

create table if not exists public.proposal_lines (
  id uuid primary key default gen_random_uuid(),
  proposal_revision_id uuid not null references public.proposal_revisions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  requested_qty integer not null check (requested_qty > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_revision_id, product_id)
);

create table if not exists public.proposal_route_snapshots (
  id uuid primary key default gen_random_uuid(),
  proposal_revision_id uuid not null references public.proposal_revisions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  selected_wave_id uuid references public.purchase_waves(id),
  baseline_ex_price numeric(18,6) not null check (baseline_ex_price >= 0),
  planned_capacity integer not null check (planned_capacity >= 0),
  remaining_capacity integer not null check (remaining_capacity >= 0),
  requested_qty integer not null check (requested_qty > 0),
  reference_amount numeric(20,2) not null check (reference_amount >= 0),
  over_plan boolean not null default false,
  route_kind public.proposal_route_kind not null,
  route_reason text not null,
  policy_id uuid references public.proposal_approval_policies(id),
  created_at timestamptz not null default now(),
  unique (proposal_revision_id, product_id)
);

create table if not exists public.capacity_reservations (
  id uuid primary key default gen_random_uuid(),
  proposal_revision_id uuid not null references public.proposal_revisions(id) on delete cascade,
  wave_id uuid not null references public.purchase_waves(id),
  product_id uuid not null references public.products(id),
  reserved_qty integer not null check (reserved_qty > 0),
  status public.proposal_capacity_status not null default 'held',
  created_at timestamptz not null default now(),
  released_at timestamptz,
  unique (proposal_revision_id, wave_id, product_id)
);

create index if not exists purchase_proposals_owner_status_idx on public.purchase_proposals(owner_id, status);
create index if not exists purchase_proposals_assignee_status_idx on public.purchase_proposals(assigned_manager_id, status);
create index if not exists purchase_proposals_executive_status_idx on public.purchase_proposals(assigned_executive_id, status);
create index if not exists proposal_revisions_proposal_idx on public.proposal_revisions(proposal_id, revision_number desc);
create index if not exists proposal_lines_revision_product_idx on public.proposal_lines(proposal_revision_id, product_id);
create index if not exists proposal_route_snapshots_wave_idx on public.proposal_route_snapshots(selected_wave_id, product_id);
create index if not exists capacity_reservations_wave_product_idx on public.capacity_reservations(wave_id, product_id, status);
create unique index if not exists capacity_reservations_one_active_idx on public.capacity_reservations(proposal_revision_id, wave_id, product_id) where status in ('held', 'consumed');

alter table public.purchase_proposals enable row level security;
alter table public.proposal_revisions enable row level security;
alter table public.proposal_lines enable row level security;
alter table public.proposal_route_snapshots enable row level security;
alter table public.capacity_reservations enable row level security;

-- Proposal creators may need the SKU picker even when Admin has not granted
-- them the separate master-data capability. These read-only security-definer
-- helpers expose only active brand/SKU labels and never baseline quantities.
create or replace function public.list_proposal_brand_options_v2()
returns table (id uuid, code text, name text, is_active boolean)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.code, b.name, b.is_active
  from public.brands b
  where b.is_active
    and (public.current_user_is_administrator_v2() or public.can_use_brand_capability(b.id, 'create_purchase_proposal'::public.user_capability))
  order by b.code;
$$;

create or replace function public.list_proposal_product_options_v2(p_brand_id uuid)
returns table (id uuid, brand_id uuid, canonical_sku text, name text, is_active boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.brand_id, p.canonical_sku, p.name, p.is_active
  from public.products p
  where p.brand_id = p_brand_id and p.is_active
    and (public.current_user_is_administrator_v2() or public.can_use_brand_capability(p_brand_id, 'create_purchase_proposal'::public.user_capability))
  order by p.canonical_sku;
$$;

create or replace function public.v2_proposal_revision_access(p_revision_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.current_profile_is_active() and exists (
    select 1 from public.proposal_revisions pr
    join public.purchase_proposals p on p.id = pr.proposal_id
    where pr.id = p_revision_id
      and (
        (p_write and p.owner_id = (select auth.uid()) and p.status in ('draft', 'changes_requested'))
        or (not p_write and (
          (p.status in ('draft', 'changes_requested') and p.owner_id = (select auth.uid()))
          or (p.status = 'pending_manager' and (p.owner_id = (select auth.uid()) or p.assigned_manager_id = (select auth.uid())))
          or (p.status = 'pending_executive' and (p.owner_id = (select auth.uid()) or p.assigned_executive_id = (select auth.uid())))
          or (p.status in ('approved', 'rejected', 'withdrawn', 'cancelled') and (p.owner_id = (select auth.uid()) or public.can_use_brand_capability(p.brand_id, 'view_approved_plan'::public.user_capability)))
          or public.current_user_is_administrator_v2()
        ))
      )
  );
$$;

drop policy if exists purchase_proposals_select_scoped on public.purchase_proposals;
drop policy if exists proposal_revisions_select_scoped on public.proposal_revisions;
drop policy if exists proposal_lines_select_scoped on public.proposal_lines;
drop policy if exists proposal_route_snapshots_select_scoped on public.proposal_route_snapshots;
drop policy if exists capacity_reservations_select_scoped on public.capacity_reservations;
create policy purchase_proposals_select_scoped on public.purchase_proposals for select to authenticated using (
  public.current_profile_is_active()
  and (
    owner_id = (select auth.uid())
    or (status = 'pending_manager' and assigned_manager_id = (select auth.uid()))
    or (status = 'pending_executive' and assigned_executive_id = (select auth.uid()))
    or (status in ('approved', 'rejected', 'withdrawn', 'cancelled') and public.can_use_brand_capability(brand_id, 'view_approved_plan'::public.user_capability))
    or public.current_user_is_administrator_v2()
  )
);
create policy proposal_revisions_select_scoped on public.proposal_revisions for select to authenticated using (public.v2_proposal_revision_access(id, false));
create policy proposal_lines_select_scoped on public.proposal_lines for select to authenticated using (public.v2_proposal_revision_access(proposal_revision_id, false));
create policy proposal_route_snapshots_select_scoped on public.proposal_route_snapshots for select to authenticated using (public.v2_proposal_revision_access(proposal_revision_id, false));
create policy capacity_reservations_select_scoped on public.capacity_reservations for select to authenticated using (public.v2_proposal_revision_access(proposal_revision_id, false));

revoke all on table public.purchase_proposals, public.proposal_revisions, public.proposal_lines, public.proposal_route_snapshots, public.capacity_reservations from anon, authenticated;
grant select on table public.purchase_proposals, public.proposal_revisions, public.proposal_lines, public.proposal_route_snapshots, public.capacity_reservations to authenticated;

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
  if not public.current_profile_is_active() or not public.current_user_is_administrator_v2() then raise exception using errcode = '42501', message = 'PROPOSAL_POLICY_ADMIN_REQUIRED'; end if;
  if p_idempotency_key is null or btrim(coalesce(p_name, '')) = '' or coalesce(array_length(p_brand_ids, 1), 0) = 0 or p_effective_from is null or (p_effective_to is not null and p_effective_to < p_effective_from) or p_currency_code !~ '^[A-Z]{3}$' or (p_mode = 'threshold' and (p_threshold_amount is null or p_threshold_amount < 0)) or (p_mode = 'fixed_two_level' and p_threshold_amount is not null) then raise exception using errcode = 'P0001', message = 'PROPOSAL_POLICY_INVALID'; end if;
  request_payload := jsonb_build_object('name', btrim(p_name), 'mode', p_mode, 'thresholdAmount', p_threshold_amount, 'currencyCode', p_currency_code, 'brandIds', to_jsonb(p_brand_ids), 'effectiveFrom', p_effective_from, 'effectiveTo', p_effective_to);
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'create_proposal_approval_policy_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  foreach target_brand_id in array p_brand_ids loop
    if not exists (select 1 from public.brands where id = target_brand_id and is_active) then raise exception using errcode = 'P0001', message = 'PROPOSAL_POLICY_BRAND_NOT_FOUND'; end if;
    if not exists (select 1 from public.user_brand_permissions ubp where ubp.user_id = actor_id and ubp.brand_id = target_brand_id and ubp.capability = 'administer_system'::public.user_capability) and not public.current_user_is_administrator_v2() then raise exception using errcode = '42501', message = 'PROPOSAL_POLICY_BRAND_FORBIDDEN'; end if;
    if exists (
      select 1 from public.proposal_approval_policy_brands pb join public.proposal_approval_policies policy on policy.id = pb.policy_id
      where pb.brand_id = target_brand_id and pb.is_active and policy.is_active
        and daterange(pb.effective_from, coalesce(pb.effective_to, 'infinity'::date), '[]') && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
    ) then raise exception using errcode = 'P0001', message = 'PROPOSAL_POLICY_OVERLAP'; end if;
  end loop;
  insert into public.proposal_approval_policies(name, mode, threshold_amount, currency_code, version, effective_from, effective_to, is_default, is_active, created_by)
  values (btrim(p_name), p_mode, p_threshold_amount, p_currency_code, coalesce((select max(version) + 1 from public.proposal_approval_policies where name = btrim(p_name)), 1), p_effective_from, p_effective_to, false, true, actor_id)
  returning id into policy_id;
  foreach target_brand_id in array p_brand_ids loop
    insert into public.proposal_approval_policy_brands(policy_id, brand_id, effective_from, effective_to, is_active, created_by) values (policy_id, target_brand_id, p_effective_from, p_effective_to, true, actor_id);
  end loop;
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('policyId', policy_id, 'mode', p_mode, 'brandIds', to_jsonb(p_brand_ids)));
  perform public.write_audit_event(p_brand_ids[1], 'proposal_approval_policy_created', 'approval_policy', policy_id, p_idempotency_key, null, request_payload -> 'data', jsonb_build_object('source', 'v2'));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'create_proposal_approval_policy_v2', policy_id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

create or replace function public.create_or_resume_proposal_v2(
  p_brand_id uuid,
  p_planning_year integer,
  p_needed_month date,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_cycle_id uuid;
  baseline_id uuid;
  manager_id uuid;
  executive_id uuid;
  proposal_id uuid;
  revision_id uuid;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
begin
  if not public.current_profile_is_active() or not public.can_use_brand_capability(p_brand_id, 'create_purchase_proposal'::public.user_capability) then raise exception using errcode = '42501', message = 'PROPOSAL_BRAND_ACCESS_REQUIRED'; end if;
  if p_planning_year < extract(year from current_date)::integer or p_needed_month <> date_trunc('month', p_needed_month)::date or extract(year from p_needed_month) <> p_planning_year or length(btrim(coalesce(p_reason, ''))) not between 10 and 1000 then raise exception using errcode = 'P0001', message = 'PROPOSAL_INPUT_INVALID'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('brandId', p_brand_id, 'planningYear', p_planning_year, 'neededMonth', p_needed_month, 'reason', btrim(p_reason));
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'create_or_resume_proposal_v2' or existing_action.created_by <> actor_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select c.id into target_cycle_id from public.annual_plan_cycles c where c.brand_id = p_brand_id and c.planning_year = p_planning_year;
  select r.id into baseline_id from public.annual_plan_revisions r where r.cycle_id = target_cycle_id and r.status = 'approved' order by r.revision_number desc limit 1;
  if baseline_id is null then raise exception using errcode = 'P0001', message = 'PROPOSAL_BASELINE_NOT_APPROVED'; end if;
  if not exists (select 1 from public.purchase_wave_revisions wr join public.purchase_waves w on w.id = wr.wave_id where wr.revision_id = baseline_id and w.status <> 'cancelled') then raise exception using errcode = 'P0001', message = 'PROPOSAL_NO_ACTIVE_WAVE'; end if;
  select rl.supervisor_id into manager_id from public.reporting_lines rl join public.profiles owner on owner.id = rl.user_id where rl.user_id = actor_id and owner.org_tier = 'leader';
  if manager_id is null then manager_id := actor_id; end if;
  select rl.supervisor_id into executive_id from public.reporting_lines rl where rl.user_id = manager_id;
  if executive_id is null and (select org_tier from public.profiles where id = manager_id) <> 'executive' then raise exception using errcode = 'P0001', message = 'PROPOSAL_APPROVER_PATH_MISSING'; end if;
  insert into public.purchase_proposals(brand_id, planning_year, owner_id, needed_month, reason, baseline_revision_id, assigned_manager_id, assigned_executive_id)
  values (p_brand_id, p_planning_year, actor_id, p_needed_month, btrim(p_reason), baseline_id, manager_id, executive_id)
  returning id into proposal_id;
  insert into public.proposal_revisions(proposal_id, revision_number, owner_id) values (proposal_id, 1, actor_id) returning id into revision_id;
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('proposalId', proposal_id, 'revisionId', revision_id, 'status', 'draft', 'lockVersion', 0));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'create_or_resume_proposal_v2', proposal_id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

create or replace function public.save_proposal_v2(p_proposal_id uuid, p_expected_lock_version integer, p_lines jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.purchase_proposals%rowtype;
  revision_id uuid;
  line_row jsonb;
  product_id uuid;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
begin
  request_payload := jsonb_build_object('proposalId', p_proposal_id, 'expectedLockVersion', p_expected_lock_version, 'lines', p_lines);
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'save_proposal_v2' or existing_action.created_by <> actor_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  if not exists (select 1 from public.purchase_proposals p where p.id = p_proposal_id and p.owner_id = (select auth.uid()) and p.status in ('draft', 'changes_requested')) then raise exception using errcode = '42501', message = 'PROPOSAL_DRAFT_FORBIDDEN'; end if;
  select * into proposal_row from public.purchase_proposals where id = p_proposal_id for update;
  if proposal_row.lock_version <> p_expected_lock_version then raise exception using errcode = 'P0001', message = 'PROPOSAL_LOCK_CONFLICT'; end if;
  select pr.id into revision_id from public.proposal_revisions pr where pr.proposal_id = p_proposal_id order by pr.revision_number desc limit 1;
  if jsonb_typeof(p_lines) <> 'array' then raise exception using errcode = 'P0001', message = 'PROPOSAL_LINES_INVALID'; end if;
  delete from public.proposal_lines where proposal_revision_id = revision_id;
  for line_row in select * from pg_catalog.jsonb_array_elements(p_lines) loop
    product_id := (line_row ->> 'productId')::uuid;
    if not exists (select 1 from public.products p where p.id = product_id and p.brand_id = proposal_row.brand_id and p.is_active) then raise exception using errcode = 'P0001', message = 'PROPOSAL_PRODUCT_FORBIDDEN'; end if;
    insert into public.proposal_lines(proposal_revision_id, product_id, requested_qty) values (revision_id, product_id, (line_row ->> 'requestedQty')::integer);
  end loop;
  update public.purchase_proposals set lock_version = lock_version + 1, updated_at = now() where id = p_proposal_id returning * into proposal_row;
  result_payload := jsonb_build_object('proposalId', p_proposal_id, 'revisionId', revision_id, 'lockVersion', proposal_row.lock_version);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'save_proposal_v2', p_proposal_id, jsonb_build_object('request', request_payload, 'data', result_payload), actor_id);
  return result_payload;
end;
$$;

create or replace function public.submit_proposal_v2(p_proposal_id uuid, p_expected_lock_version integer, p_idempotency_key uuid)
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
    if existing_action.action_type <> 'submit_proposal_v2' or existing_action.created_by <> actor_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into proposal_row from public.purchase_proposals where id = p_proposal_id for update;
  if proposal_row.owner_id <> (select auth.uid()) or proposal_row.status not in ('draft', 'changes_requested') then raise exception using errcode = '42501', message = 'PROPOSAL_DRAFT_FORBIDDEN'; end if;
  if proposal_row.lock_version <> p_expected_lock_version then raise exception using errcode = 'P0001', message = 'PROPOSAL_LOCK_CONFLICT'; end if;
  select pr.id into current_revision_id from public.proposal_revisions pr where pr.proposal_id = p_proposal_id order by pr.revision_number desc limit 1;
  if not exists (select 1 from public.proposal_lines where proposal_revision_id = current_revision_id) then raise exception using errcode = 'P0001', message = 'PROPOSAL_LINES_REQUIRED'; end if;
  select policy.* into policy_row from public.proposal_approval_policy_brands pb join public.proposal_approval_policies policy on policy.id = pb.policy_id where pb.brand_id = proposal_row.brand_id and pb.is_active and policy.is_active and current_date >= pb.effective_from and (pb.effective_to is null or current_date <= pb.effective_to) and current_date >= policy.effective_from and (policy.effective_to is null or current_date <= policy.effective_to) order by policy.version desc limit 1;
  if policy_row.id is null then select * into policy_row from public.proposal_approval_policies where is_default and is_active order by version desc limit 1; end if;
  if policy_row.id is null then route := 'manager_then_executive'; else select coalesce(sum(pl.requested_qty::numeric * l.ex_price), 0) into reference_amount from public.proposal_lines pl join public.annual_plan_lines l on l.revision_id = proposal_row.baseline_revision_id and l.product_id = pl.product_id where pl.proposal_revision_id = current_revision_id; if policy_row.mode = 'threshold' and reference_amount < policy_row.threshold_amount then route := 'manager_only'; end if; end if;
  select org_tier into owner_tier from public.profiles where id = proposal_row.owner_id;
  -- A Manager may approve their own request, but the PO must be selected first.
  -- Keep the request at the Manager step until assign_proposal_wave_v2 records
  -- the selected stable PO; that command can then auto-complete L1 for a
  -- manager-owned request or advance it to the Executive step.
  -- Executive-owned proposals still need a PO selection before the owner can
  -- self-approve. Keep them at the manager placeholder until assignment; the
  -- assignment command completes the self-approval atomically.
  if owner_tier = 'executive' then status_value := 'pending_manager'; elsif proposal_row.owner_id = proposal_row.assigned_manager_id then status_value := 'pending_manager'; end if;
  update public.purchase_proposals set status = status_value, route_kind = route, route_reason = case when policy_row.mode = 'threshold' then 'threshold' else 'forced_two_level' end, policy_id = policy_row.id, lock_version = lock_version + 1, updated_at = now() where id = p_proposal_id returning * into proposal_row;
  if proposal_row.assigned_manager_id is not null and proposal_row.assigned_manager_id <> actor_id then
    perform public.enqueue_notification_v2(proposal_row.assigned_manager_id, proposal_row.id, 'proposal_submitted', 'Có đề xuất mua hàng mới', 'Một đề xuất đang chờ bạn kiểm tra và ghi nhận vào PO.', '/proposals/' || proposal_row.id::text);
  end if;
  if proposal_row.assigned_executive_id is not null and proposal_row.assigned_executive_id <> proposal_row.assigned_manager_id then
    perform public.enqueue_notification_v2(proposal_row.assigned_executive_id, proposal_row.id, 'proposal_submitted', 'Thông tin đề xuất mua hàng', 'CEO/BOD luôn nhận được thông tin về đề xuất mới.', '/proposals/' || proposal_row.id::text);
  end if;
  result_payload := jsonb_build_object('proposalId', proposal_row.id, 'revisionId', current_revision_id, 'status', proposal_row.status, 'route', proposal_row.route_kind, 'referenceAmount', reference_amount);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'submit_proposal_v2', p_proposal_id, jsonb_build_object('request', request_payload, 'data', result_payload), actor_id);
  return result_payload;
end;
$$;

create or replace function public.assign_proposal_wave_v2(p_proposal_id uuid, p_expected_lock_version integer, p_wave_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.purchase_proposals%rowtype;
  current_revision_id uuid;
  line_row record;
  baseline_qty integer;
  reserved_qty integer;
  remaining_qty integer;
  over_plan boolean := false;
  effective_route public.proposal_route_kind;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
begin
  request_payload := jsonb_build_object('proposalId', p_proposal_id, 'expectedLockVersion', p_expected_lock_version, 'waveId', p_wave_id);
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'assign_proposal_wave_v2' or existing_action.created_by <> actor_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into proposal_row from public.purchase_proposals where id = p_proposal_id for update;
  if proposal_row.status <> 'pending_manager' or (select auth.uid()) <> proposal_row.assigned_manager_id then raise exception using errcode = '42501', message = 'PROPOSAL_ASSIGNMENT_FORBIDDEN'; end if;
  if proposal_row.lock_version <> p_expected_lock_version then raise exception using errcode = 'P0001', message = 'PROPOSAL_LOCK_CONFLICT'; end if;
  if not exists (
    select 1 from public.purchase_waves w
    join public.purchase_wave_revisions wr on wr.wave_id = w.id and wr.revision_id = proposal_row.baseline_revision_id
    where w.id = p_wave_id and w.status <> 'cancelled'
  ) then raise exception using errcode = 'P0001', message = 'PROPOSAL_WAVE_FORBIDDEN'; end if;
  select pr.id into current_revision_id from public.proposal_revisions pr where pr.proposal_id = p_proposal_id order by pr.revision_number desc limit 1;
  -- Re-selecting a PO must not leave the previous held capacity reservation
  -- consuming capacity after the proposal has moved to the new PO.
  update public.capacity_reservations
  set status = 'released', released_at = now()
  where proposal_revision_id = current_revision_id and status = 'held';
  delete from public.proposal_route_snapshots where proposal_revision_id = current_revision_id;
  for line_row in select pl.product_id, pl.requested_qty, l.ex_price, coalesce(sum(a.paid_qty + a.foc_qty), 0)::integer planned_qty from public.proposal_lines pl join public.annual_plan_lines l on l.revision_id = proposal_row.baseline_revision_id and l.product_id = pl.product_id left join public.purchase_wave_revisions wr on wr.wave_id = p_wave_id and wr.revision_id = proposal_row.baseline_revision_id left join public.purchase_wave_allocations a on a.wave_revision_id = wr.id and a.product_id = pl.product_id group by pl.product_id, pl.requested_qty, l.ex_price loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(format('proposal-capacity:%s:%s', p_wave_id, line_row.product_id), 0));
    select coalesce(sum(cr.reserved_qty), 0)::integer into reserved_qty from public.capacity_reservations cr where cr.wave_id = p_wave_id and cr.product_id = line_row.product_id and cr.status in ('held', 'consumed');
    baseline_qty := line_row.planned_qty; remaining_qty := greatest(baseline_qty - reserved_qty, 0); over_plan := over_plan or line_row.requested_qty > remaining_qty;
    insert into public.proposal_route_snapshots(proposal_revision_id, product_id, selected_wave_id, baseline_ex_price, planned_capacity, remaining_capacity, requested_qty, reference_amount, over_plan, route_kind, route_reason, policy_id) values (current_revision_id, line_row.product_id, p_wave_id, line_row.ex_price, baseline_qty, remaining_qty, line_row.requested_qty, round(line_row.requested_qty::numeric * line_row.ex_price, 2), line_row.requested_qty > remaining_qty, case when line_row.requested_qty > remaining_qty then 'manager_then_executive'::public.proposal_route_kind else coalesce(proposal_row.route_kind, 'manager_then_executive'::public.proposal_route_kind) end, case when line_row.requested_qty > remaining_qty then 'over_plan' else coalesce(proposal_row.route_reason, 'forced_two_level') end, proposal_row.policy_id);
    insert into public.capacity_reservations(proposal_revision_id, wave_id, product_id, reserved_qty, status) values (current_revision_id, p_wave_id, line_row.product_id, line_row.requested_qty, 'held');
  end loop;
  effective_route := case when over_plan then 'manager_then_executive'::public.proposal_route_kind else proposal_row.route_kind end;
  update public.purchase_proposals set route_kind = effective_route, route_reason = case when over_plan then 'over_plan' else route_reason end, status = case when proposal_row.owner_id = proposal_row.assigned_manager_id and (select org_tier from public.profiles where id = proposal_row.owner_id) = 'executive'::public.org_tier then 'approved' when proposal_row.owner_id = proposal_row.assigned_manager_id and effective_route = 'manager_then_executive' then 'pending_executive' when proposal_row.owner_id = proposal_row.assigned_manager_id then 'approved' else status end, lock_version = lock_version + 1, updated_at = now() where id = p_proposal_id returning * into proposal_row;
  if proposal_row.owner_id = proposal_row.assigned_manager_id then
    perform public.write_audit_event(proposal_row.brand_id, case when (select org_tier from public.profiles where id = proposal_row.owner_id) = 'executive'::public.org_tier then 'proposal_self_approved' else 'proposal_manager_self_approved' end, 'purchase_proposal', proposal_row.id, p_idempotency_key, null, jsonb_build_object('proposalId', proposal_row.id, 'createdBy', proposal_row.owner_id, 'approvedBy', actor_id, 'status', proposal_row.status, 'route', effective_route), jsonb_build_object('selfApproval', true, 'level', 1, 'source', 'v2'));
  end if;
  if over_plan and proposal_row.assigned_executive_id is not null then
    perform public.enqueue_notification_v2(proposal_row.assigned_executive_id, proposal_row.id, 'proposal_over_plan', 'Đề xuất vượt kế hoạch', 'Đề xuất đã vượt phần còn lại của PO và bắt buộc duyệt hai cấp.', '/proposals/' || proposal_row.id::text);
  end if;
  result_payload := jsonb_build_object('proposalId', proposal_row.id, 'status', proposal_row.status, 'route', proposal_row.route_kind, 'overPlan', over_plan, 'lockVersion', proposal_row.lock_version);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'assign_proposal_wave_v2', p_proposal_id, jsonb_build_object('request', request_payload, 'data', result_payload), actor_id);
  return result_payload;
end;
$$;

create or replace function public.decide_proposal_v2(p_proposal_id uuid, p_decision text, p_comment text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.purchase_proposals%rowtype;
  next_status text;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
begin
  -- Idempotency is checked before the state transition so a retry returns the
  -- original decision instead of trying to apply it twice.
  request_payload := jsonb_build_object('proposalId', p_proposal_id, 'decision', p_decision, 'comment', btrim(coalesce(p_comment, '')));
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'decide_proposal_v2' or existing_action.created_by <> actor_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into proposal_row from public.purchase_proposals where id = p_proposal_id for update;
  if p_decision not in ('approve', 'reject', 'request_changes') or proposal_row.status not in ('pending_manager', 'pending_executive') or (proposal_row.status = 'pending_manager' and proposal_row.assigned_manager_id <> (select auth.uid())) or (proposal_row.status = 'pending_executive' and proposal_row.assigned_executive_id <> (select auth.uid())) then raise exception using errcode = '42501', message = 'PROPOSAL_DECISION_FORBIDDEN'; end if;
  if p_decision = 'request_changes' and length(btrim(coalesce(p_comment, ''))) < 10 then raise exception using errcode = 'P0001', message = 'PROPOSAL_COMMENT_REQUIRED'; end if;
  next_status := case when p_decision = 'reject' then 'rejected' when p_decision = 'request_changes' then 'changes_requested' when proposal_row.status = 'pending_manager' and proposal_row.route_kind = 'manager_then_executive' then 'pending_executive' else 'approved' end;
  if p_decision = 'approve' and not exists (
    select 1 from public.proposal_route_snapshots prs
    join public.proposal_revisions pr on pr.id = prs.proposal_revision_id
    where pr.proposal_id = p_proposal_id and prs.selected_wave_id is not null
  ) then
    raise exception using errcode = 'P0001', message = 'PROPOSAL_WAVE_REQUIRED';
  end if;
  update public.purchase_proposals set status = next_status, updated_at = now() where id = p_proposal_id returning * into proposal_row;
  if next_status = 'pending_executive' then
    perform public.enqueue_notification_v2(proposal_row.assigned_executive_id, proposal_row.id, 'proposal_approval_required', 'Cần CEO/BOD phê duyệt', 'Đề xuất đã qua cấp quản lý và đang chờ phê duyệt cấp cuối.', '/proposals/' || proposal_row.id::text);
  elsif next_status = 'approved' then
    perform public.enqueue_notification_v2(proposal_row.owner_id, proposal_row.id, 'proposal_approved', 'Đề xuất đã được duyệt', 'Đề xuất mua hàng đã được phê duyệt và ghi nhận vào PO.', '/proposals/' || proposal_row.id::text);
  elsif next_status = 'rejected' then
    perform public.enqueue_notification_v2(proposal_row.owner_id, proposal_row.id, 'proposal_rejected', 'Đề xuất bị từ chối', coalesce(nullif(btrim(p_comment), ''), 'Đề xuất không được phê duyệt.'), '/proposals/' || proposal_row.id::text);
  elsif next_status = 'changes_requested' then
    perform public.enqueue_notification_v2(proposal_row.owner_id, proposal_row.id, 'proposal_changes_requested', 'Đề xuất cần chỉnh sửa', btrim(p_comment), '/proposals/' || proposal_row.id::text);
  end if;
  if next_status in ('approved', 'rejected', 'withdrawn', 'cancelled') then
    update public.capacity_reservations
    set status = case when next_status = 'approved' then 'consumed' else 'released' end::public.proposal_capacity_status,
        released_at = case when next_status = 'approved' then null else now() end
    where proposal_revision_id in (select id from public.proposal_revisions where proposal_id = p_proposal_id)
      and status = 'held'::public.proposal_capacity_status;
  end if;
  result_payload := jsonb_build_object('proposalId', proposal_row.id, 'status', proposal_row.status);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'decide_proposal_v2', p_proposal_id, jsonb_build_object('request', request_payload, 'data', result_payload), actor_id);
  return result_payload;
end;
$$;

create or replace function public.withdraw_proposal_v2(p_proposal_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.purchase_proposals%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
begin
  request_payload := jsonb_build_object('proposalId', p_proposal_id);
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'withdraw_proposal_v2' or existing_action.created_by <> actor_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into proposal_row from public.purchase_proposals where id = p_proposal_id for update;
  if proposal_row.owner_id <> (select auth.uid()) or proposal_row.status not in ('pending_manager', 'pending_executive') then raise exception using errcode = '42501', message = 'PROPOSAL_WITHDRAW_FORBIDDEN'; end if;
  update public.purchase_proposals set status = 'withdrawn', updated_at = now() where id = p_proposal_id returning * into proposal_row;
  update public.capacity_reservations set status = 'released', released_at = now() where proposal_revision_id in (select id from public.proposal_revisions where proposal_id = p_proposal_id) and status = 'held';
  result_payload := jsonb_build_object('proposalId', proposal_row.id, 'status', proposal_row.status);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'withdraw_proposal_v2', p_proposal_id, jsonb_build_object('request', request_payload, 'data', result_payload), actor_id);
  return result_payload;
end;
$$;

create or replace function public.request_proposal_cancellation_v2(p_proposal_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.purchase_proposals%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
begin
  request_payload := jsonb_build_object('proposalId', p_proposal_id, 'reason', btrim(coalesce(p_reason, '')));
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'request_proposal_cancellation_v2' or existing_action.created_by <> actor_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into proposal_row from public.purchase_proposals where id = p_proposal_id for update;
  if proposal_row.owner_id <> (select auth.uid()) or proposal_row.status <> 'approved' or length(btrim(coalesce(p_reason, ''))) < 10 then raise exception using errcode = '42501', message = 'PROPOSAL_CANCELLATION_FORBIDDEN'; end if;
  update public.purchase_proposals set status = case when proposal_row.route_kind = 'manager_then_executive' then 'cancellation_pending_executive' else 'cancellation_pending_manager' end, updated_at = now() where id = p_proposal_id returning * into proposal_row;
  result_payload := jsonb_build_object('proposalId', proposal_row.id, 'status', proposal_row.status);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'request_proposal_cancellation_v2', p_proposal_id, jsonb_build_object('request', request_payload, 'data', result_payload), actor_id);
  return result_payload;
end;
$$;

revoke all on table public.proposal_approval_policies, public.proposal_approval_policy_brands from anon, authenticated;
grant select on table public.proposal_approval_policies, public.proposal_approval_policy_brands to authenticated;
revoke all on function public.v2_proposal_revision_access(uuid, boolean), public.create_proposal_approval_policy_v2(text, public.proposal_approval_mode_v2, numeric, text, uuid[], date, date, uuid), public.create_or_resume_proposal_v2(uuid, integer, date, text, uuid), public.save_proposal_v2(uuid, integer, jsonb, uuid), public.submit_proposal_v2(uuid, integer, uuid), public.assign_proposal_wave_v2(uuid, integer, uuid, uuid), public.decide_proposal_v2(uuid, text, text, uuid), public.withdraw_proposal_v2(uuid, uuid), public.request_proposal_cancellation_v2(uuid, text, uuid) from public, anon;
grant execute on function public.create_proposal_approval_policy_v2(text, public.proposal_approval_mode_v2, numeric, text, uuid[], date, date, uuid), public.create_or_resume_proposal_v2(uuid, integer, date, text, uuid), public.save_proposal_v2(uuid, integer, jsonb, uuid), public.submit_proposal_v2(uuid, integer, uuid), public.assign_proposal_wave_v2(uuid, integer, uuid, uuid), public.decide_proposal_v2(uuid, text, text, uuid), public.withdraw_proposal_v2(uuid, uuid), public.request_proposal_cancellation_v2(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.list_proposal_brand_options_v2(), public.list_proposal_product_options_v2(uuid) to authenticated, service_role;
