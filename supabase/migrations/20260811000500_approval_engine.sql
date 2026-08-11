create type public.approval_mode as enum (
  'fixed_two_level',
  'threshold'
);

create type public.approval_request_status as enum (
  'pending_l1',
  'pending_l2',
  'approved',
  'changes_requested'
);

create type public.approval_step_status as enum (
  'waiting',
  'pending',
  'approved',
  'changes_requested'
);

create table public.approval_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  mode public.approval_mode not null default 'fixed_two_level',
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

create unique index approval_policies_one_active_default_idx
  on public.approval_policies (is_default)
  where is_default and is_active;

create table public.approval_policy_brands (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.approval_policies(id),
  brand_id uuid not null references public.brands(id),
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null unique references public.plan_versions(id),
  policy_id uuid not null references public.approval_policies(id),
  policy_version integer not null check (policy_version > 0),
  policy_mode public.approval_mode not null,
  threshold_amount numeric(20, 2),
  currency_code text not null
    check (currency_code = upper(currency_code) and length(currency_code) = 3),
  plan_amount numeric(20, 2) not null check (plan_amount >= 0),
  required_levels smallint not null check (required_levels in (1, 2)),
  routing_reason text not null
    check (routing_reason in ('fixed', 'under_threshold', 'threshold_met', 'exception')),
  exception_flags jsonb not null default '{}'::jsonb
    check (jsonb_typeof(exception_flags) = 'object'),
  status public.approval_request_status not null default 'pending_l1',
  current_level smallint not null default 1 check (current_level in (1, 2)),
  submit_idempotency_key uuid not null unique,
  submitted_by uuid default auth.uid() references auth.users(id),
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (policy_mode = 'fixed_two_level' and threshold_amount is null)
    or (policy_mode = 'threshold' and threshold_amount is not null)
  )
);

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  level smallint not null check (level in (1, 2)),
  required_role public.app_role not null,
  status public.approval_step_status not null,
  acted_by uuid references auth.users(id),
  acted_at timestamptz,
  comment text,
  action_idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (approval_request_id, level),
  check (
    (level = 1 and required_role = 'approver_l1')
    or (level = 2 and required_role = 'approver_l2')
  ),
  check (
    (status in ('waiting', 'pending') and acted_by is null and acted_at is null)
    or (status in ('approved', 'changes_requested') and acted_at is not null)
  )
);

create index approval_policy_brands_brand_period_idx
  on public.approval_policy_brands (
    brand_id,
    effective_from,
    effective_to
  )
  where is_active;
create index approval_policy_brands_policy_id_idx
  on public.approval_policy_brands (policy_id);
create index approval_requests_plan_status_idx
  on public.approval_requests (plan_version_id, status);
create index approval_steps_request_status_idx
  on public.approval_steps (approval_request_id, status, level);

create function public.guard_approval_policy_brand_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.brand_id::text, 0)
  );

  if new.is_active and exists (
    select 1
    from public.approval_policy_brands assignment
    where assignment.brand_id = new.brand_id
      and assignment.is_active
      and assignment.id <> new.id
      and daterange(
        assignment.effective_from,
        coalesce(assignment.effective_to, 'infinity'::date),
        '[]'
      ) && daterange(
        new.effective_from,
        coalesce(new.effective_to, 'infinity'::date),
        '[]'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'approval_policy_period_overlap';
  end if;

  return new;
end;
$$;

create trigger approval_policy_brands_overlap_guard
before insert or update on public.approval_policy_brands
for each row execute function public.guard_approval_policy_brand_overlap();

create function public.guard_default_approval_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_default then
    raise exception using
      errcode = 'P0001',
      message = 'default_approval_policy_required';
  end if;

  if tg_op = 'UPDATE'
    and old.is_default
    and (
      not new.is_default
      or not new.is_active
      or new.mode <> 'fixed_two_level'
      or new.threshold_amount is not null
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'default_approval_policy_required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger approval_policies_default_guard
before update or delete on public.approval_policies
for each row execute function public.guard_default_approval_policy();

insert into public.approval_policies (
  id,
  name,
  mode,
  threshold_amount,
  currency_code,
  version,
  effective_from,
  is_default,
  is_active
)
values (
  '70000000-0000-0000-0000-000000000001',
  'Mặc định - Duyệt hai cấp',
  'fixed_two_level',
  null,
  'EUR',
  1,
  '2000-01-01',
  true,
  true
);

create function public.approval_request_brand_id(p_approval_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select planning_cycles.brand_id
  from public.approval_requests
  join public.plan_versions
    on plan_versions.id = approval_requests.plan_version_id
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
  where approval_requests.id = p_approval_request_id;
$$;

create function public.can_access_approval_request(p_approval_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_brand(
    public.approval_request_brand_id(p_approval_request_id)
  );
$$;

create function public.submit_plan(
  p_plan_version_id uuid,
  p_idempotency_key uuid,
  p_exception_flags jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_plan public.plan_versions%rowtype;
  target_policy public.approval_policies%rowtype;
  target_brand_id uuid;
  target_currency text;
  target_amount numeric(20, 2);
  target_request_id uuid;
  required_levels smallint;
  routing_reason text;
  has_exception boolean;
begin
  if p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'approval_idempotency_key_required';
  end if;

  if jsonb_typeof(p_exception_flags) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'approval_exception_flags_must_be_object';
  end if;

  select id into target_request_id
  from public.approval_requests
  where submit_idempotency_key = p_idempotency_key;

  if found then
    return target_request_id;
  end if;

  select * into target_plan
  from public.plan_versions
  where id = p_plan_version_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'plan_version_not_found';
  end if;

  if target_plan.status <> 'draft' then
    raise exception using
      errcode = 'P0001',
      message = 'only_draft_can_be_submitted';
  end if;

  if (select auth.uid()) is not null then
    if not public.can_edit_plan_version(p_plan_version_id) then
      raise exception using
        errcode = '42501',
        message = 'plan_submit_forbidden';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'plan_submit_forbidden';
  end if;

  select planning_cycles.brand_id, planning_cycles.currency_code
  into target_brand_id, target_currency
  from public.planning_cycles
  where planning_cycles.id = target_plan.planning_cycle_id;

  select approval_policies.* into target_policy
  from public.approval_policy_brands
  join public.approval_policies
    on approval_policies.id = approval_policy_brands.policy_id
  where approval_policy_brands.brand_id = target_brand_id
    and approval_policy_brands.is_active
    and current_date >= approval_policy_brands.effective_from
    and (
      approval_policy_brands.effective_to is null
      or current_date <= approval_policy_brands.effective_to
    )
    and approval_policies.is_active
    and current_date >= approval_policies.effective_from
    and (
      approval_policies.effective_to is null
      or current_date <= approval_policies.effective_to
    )
  order by approval_policy_brands.effective_from desc, approval_policies.version desc
  limit 1;

  if not found then
    select * into target_policy
    from public.approval_policies
    where is_default
      and is_active
      and current_date >= effective_from
      and (effective_to is null or current_date <= effective_to)
    order by version desc
    limit 1;
  end if;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'approval_policy_not_found';
  end if;

  if target_policy.currency_code <> target_currency then
    raise exception using
      errcode = 'P0001',
      message = 'approval_policy_currency_mismatch';
  end if;

  select coalesce(sum(purchase_lines.amount), 0)::numeric(20, 2)
  into target_amount
  from public.purchase_batches
  join public.purchase_lines
    on purchase_lines.purchase_batch_id = purchase_batches.id
  where purchase_batches.plan_version_id = p_plan_version_id
    and purchase_batches.status <> 'cancelled';

  select coalesce(bool_or(value = 'true'::jsonb), false)
  into has_exception
  from jsonb_each(p_exception_flags);

  if target_policy.mode = 'fixed_two_level' then
    required_levels := 2;
    routing_reason := 'fixed';
  elsif has_exception then
    required_levels := 2;
    routing_reason := 'exception';
  elsif target_amount >= target_policy.threshold_amount then
    required_levels := 2;
    routing_reason := 'threshold_met';
  else
    required_levels := 1;
    routing_reason := 'under_threshold';
  end if;

  insert into public.approval_requests (
    plan_version_id,
    policy_id,
    policy_version,
    policy_mode,
    threshold_amount,
    currency_code,
    plan_amount,
    required_levels,
    routing_reason,
    exception_flags,
    status,
    current_level,
    submit_idempotency_key,
    submitted_by
  )
  values (
    p_plan_version_id,
    target_policy.id,
    target_policy.version,
    target_policy.mode,
    target_policy.threshold_amount,
    target_currency,
    target_amount,
    required_levels,
    routing_reason,
    p_exception_flags,
    'pending_l1',
    1,
    p_idempotency_key,
    (select auth.uid())
  )
  returning id into target_request_id;

  insert into public.approval_steps (
    approval_request_id,
    level,
    required_role,
    status
  )
  values (
    target_request_id,
    1,
    'approver_l1',
    'pending'
  );

  if required_levels = 2 then
    insert into public.approval_steps (
      approval_request_id,
      level,
      required_role,
      status
    )
    values (
      target_request_id,
      2,
      'approver_l2',
      'waiting'
    );
  end if;

  perform set_config('app.allow_plan_version_mutation', 'on', true);
  update public.plan_versions
  set status = 'review_l1',
      submitted_at = now()
  where id = p_plan_version_id;
  perform set_config('app.allow_plan_version_mutation', 'off', true);

  return target_request_id;
end;
$$;

create function public.approve_step(
  p_approval_request_id uuid,
  p_idempotency_key uuid,
  p_comment text default null
)
returns public.approval_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.approval_requests%rowtype;
  target_step public.approval_steps%rowtype;
  target_brand_id uuid;
  existing_status public.approval_request_status;
begin
  if p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'approval_idempotency_key_required';
  end if;

  select approval_requests.status into existing_status
  from public.approval_steps
  join public.approval_requests
    on approval_requests.id = approval_steps.approval_request_id
  where approval_steps.action_idempotency_key = p_idempotency_key;

  if found then
    return existing_status;
  end if;

  select * into target_request
  from public.approval_requests
  where id = p_approval_request_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'approval_request_not_found';
  end if;

  if target_request.status not in ('pending_l1', 'pending_l2') then
    raise exception using
      errcode = 'P0001',
      message = 'approval_request_not_pending';
  end if;

  select * into target_step
  from public.approval_steps
  where approval_request_id = p_approval_request_id
    and level = target_request.current_level
  for update;

  if not found or target_step.status <> 'pending' then
    raise exception using
      errcode = 'P0001',
      message = 'approval_step_not_pending';
  end if;

  target_brand_id := public.approval_request_brand_id(p_approval_request_id);

  if (select auth.uid()) is not null then
    if not public.can_access_brand(target_brand_id)
      or not public.current_user_has_role(target_step.required_role) then
      raise exception using
        errcode = '42501',
        message = 'approval_role_required';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'approval_role_required';
  end if;

  update public.approval_steps
  set status = 'approved',
      acted_by = (select auth.uid()),
      acted_at = now(),
      comment = nullif(btrim(p_comment), ''),
      action_idempotency_key = p_idempotency_key,
      updated_at = now()
  where id = target_step.id;

  perform set_config('app.allow_plan_version_mutation', 'on', true);

  if target_step.level = 1 and target_request.required_levels = 2 then
    update public.approval_steps
    set status = 'pending',
        updated_at = now()
    where approval_request_id = p_approval_request_id
      and level = 2
      and status = 'waiting';

    update public.approval_requests
    set status = 'pending_l2',
        current_level = 2,
        updated_at = now()
    where id = p_approval_request_id;

    update public.plan_versions
    set status = 'review_l2'
    where id = target_request.plan_version_id;

    perform set_config('app.allow_plan_version_mutation', 'off', true);
    return 'pending_l2';
  end if;

  update public.approval_requests
  set status = 'approved',
      completed_at = now(),
      updated_at = now()
  where id = p_approval_request_id;

  update public.plan_versions
  set status = 'approved',
      approved_at = now()
  where id = target_request.plan_version_id;

  perform set_config('app.allow_plan_version_mutation', 'off', true);
  return 'approved';
end;
$$;

create function public.request_changes(
  p_approval_request_id uuid,
  p_idempotency_key uuid,
  p_comment text
)
returns public.approval_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.approval_requests%rowtype;
  target_step public.approval_steps%rowtype;
  target_brand_id uuid;
  existing_status public.approval_request_status;
begin
  if p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'approval_idempotency_key_required';
  end if;

  if p_comment is null or btrim(p_comment) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'request_changes_comment_required';
  end if;

  select approval_requests.status into existing_status
  from public.approval_steps
  join public.approval_requests
    on approval_requests.id = approval_steps.approval_request_id
  where approval_steps.action_idempotency_key = p_idempotency_key;

  if found then
    return existing_status;
  end if;

  select * into target_request
  from public.approval_requests
  where id = p_approval_request_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'approval_request_not_found';
  end if;

  if target_request.status not in ('pending_l1', 'pending_l2') then
    raise exception using
      errcode = 'P0001',
      message = 'approval_request_not_pending';
  end if;

  select * into target_step
  from public.approval_steps
  where approval_request_id = p_approval_request_id
    and level = target_request.current_level
  for update;

  if not found or target_step.status <> 'pending' then
    raise exception using
      errcode = 'P0001',
      message = 'approval_step_not_pending';
  end if;

  target_brand_id := public.approval_request_brand_id(p_approval_request_id);

  if (select auth.uid()) is not null then
    if not public.can_access_brand(target_brand_id)
      or not public.current_user_has_role(target_step.required_role) then
      raise exception using
        errcode = '42501',
        message = 'approval_role_required';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'approval_role_required';
  end if;

  update public.approval_steps
  set status = 'changes_requested',
      acted_by = (select auth.uid()),
      acted_at = now(),
      comment = btrim(p_comment),
      action_idempotency_key = p_idempotency_key,
      updated_at = now()
  where id = target_step.id;

  update public.approval_requests
  set status = 'changes_requested',
      completed_at = now(),
      updated_at = now()
  where id = p_approval_request_id;

  perform set_config('app.allow_plan_version_mutation', 'on', true);
  update public.plan_versions
  set status = 'changes_requested'
  where id = target_request.plan_version_id;
  perform set_config('app.allow_plan_version_mutation', 'off', true);

  return 'changes_requested';
end;
$$;

revoke all on function public.guard_approval_policy_brand_overlap()
  from public, anon, authenticated;
revoke all on function public.guard_default_approval_policy()
  from public, anon, authenticated;
revoke all on function public.approval_request_brand_id(uuid)
  from public, anon;
revoke all on function public.can_access_approval_request(uuid)
  from public, anon;
revoke all on function public.submit_plan(uuid, uuid, jsonb)
  from public, anon;
revoke all on function public.approve_step(uuid, uuid, text)
  from public, anon;
revoke all on function public.request_changes(uuid, uuid, text)
  from public, anon;

grant execute on function public.approval_request_brand_id(uuid)
  to authenticated;
grant execute on function public.can_access_approval_request(uuid)
  to authenticated;
grant execute on function public.submit_plan(uuid, uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.approve_step(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.request_changes(uuid, uuid, text)
  to authenticated, service_role;

alter table public.approval_policies enable row level security;
alter table public.approval_policy_brands enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_steps enable row level security;

create policy approval_policies_select_by_access
on public.approval_policies
for select
to authenticated
using (
  is_default
  or public.current_user_has_role('administrator'::public.app_role)
  or exists (
    select 1
    from public.approval_policy_brands
    where approval_policy_brands.policy_id = approval_policies.id
      and public.can_access_brand(approval_policy_brands.brand_id)
  )
);

create policy approval_policies_manage_admin
on public.approval_policies
for all
to authenticated
using (public.current_user_has_role('administrator'::public.app_role))
with check (public.current_user_has_role('administrator'::public.app_role));

create policy approval_policy_brands_select_by_access
on public.approval_policy_brands
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy approval_policy_brands_manage_admin
on public.approval_policy_brands
for all
to authenticated
using (public.can_administer_brand(brand_id))
with check (public.can_administer_brand(brand_id));

create policy approval_requests_select_by_access
on public.approval_requests
for select
to authenticated
using (public.can_access_plan_version(plan_version_id));

create policy approval_steps_select_by_access
on public.approval_steps
for select
to authenticated
using (public.can_access_approval_request(approval_request_id));

revoke all on table public.approval_policies from anon, authenticated;
revoke all on table public.approval_policy_brands from anon, authenticated;
revoke all on table public.approval_requests from anon, authenticated;
revoke all on table public.approval_steps from anon, authenticated;

grant select, insert, update, delete on table public.approval_policies
  to authenticated;
grant select, insert, update, delete on table public.approval_policy_brands
  to authenticated;
grant select on table public.approval_requests to authenticated;
grant select on table public.approval_steps to authenticated;

grant all on table public.approval_policies to service_role;
grant all on table public.approval_policy_brands to service_role;
grant all on table public.approval_requests to service_role;
grant all on table public.approval_steps to service_role;

grant usage on type public.approval_mode to authenticated, service_role;
grant usage on type public.approval_request_status to authenticated, service_role;
grant usage on type public.approval_step_status to authenticated, service_role;

comment on table public.approval_requests is
  'Immutable policy and routing snapshot captured when a Draft is submitted.';
comment on function public.submit_plan(uuid, uuid, jsonb) is
  'Atomically snapshots the active brand policy and moves a Draft to L1 review.';
comment on function public.approve_step(uuid, uuid, text) is
  'Atomically approves exactly the current step and advances or finalizes the plan.';
comment on function public.request_changes(uuid, uuid, text) is
  'Closes the current approval request without changing immutable plan child rows.';
