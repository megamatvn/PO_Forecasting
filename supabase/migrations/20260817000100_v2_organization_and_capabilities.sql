-- Purchase Planning V2: organization hierarchy, capabilities, and scoped access.
-- This is an additive migration. Legacy app_role/user_brand_access APIs remain available
-- until the final cutover migration.

do $$
begin
  create type public.org_tier as enum (
    'employee_viewer',
    'leader',
    'manager',
    'executive'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.user_capability as enum (
    'create_annual_plan',
    'view_approved_plan',
    'create_purchase_proposal',
    'manage_master_data',
    'administer_system'
  );
exception when duplicate_object then null;
end;
$$;

alter table public.profiles
  add column if not exists org_tier public.org_tier not null default 'employee_viewer';

create table if not exists public.reporting_lines (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  supervisor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id <> supervisor_id)
);

create table if not exists public.user_capabilities (
  user_id uuid not null references public.profiles(id) on delete cascade,
  capability public.user_capability not null,
  created_at timestamptz not null default now(),
  primary key (user_id, capability)
);

create table if not exists public.user_brand_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  capability public.user_capability not null,
  source_kind text not null check (source_kind in ('direct', 'inherited')),
  source_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id, capability, source_kind, source_user_id)
);

-- Approval steps predate the V2 reporting-line model. Keep the column nullable
-- for existing requests; new routing code can persist the exact assigned user,
-- and replacement can move pending work atomically.
alter table if exists public.approval_steps
  add column if not exists assigned_user_id uuid references public.profiles(id);
create index if not exists approval_steps_assigned_pending_idx
  on public.approval_steps (assigned_user_id, status)
  where status in ('waiting'::public.approval_step_status, 'pending'::public.approval_step_status);

create index if not exists reporting_lines_supervisor_id_idx
  on public.reporting_lines (supervisor_id);
create index if not exists user_capabilities_user_capability_idx
  on public.user_capabilities (user_id, capability);
create index if not exists user_brand_permissions_user_brand_capability_idx
  on public.user_brand_permissions (user_id, brand_id, capability);
create index if not exists user_brand_permissions_source_idx
  on public.user_brand_permissions (source_kind, source_user_id);

create or replace function public.current_profile_is_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active
  );
$$;

create or replace function public.current_user_is_administrator_v2()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_profile_is_active()
    and exists (
      select 1 from public.user_capabilities
      where user_id = (select auth.uid())
        and capability = 'administer_system'::public.user_capability
    );
$$;

-- Keep legacy policy helpers aligned with the V2 active-account and
-- Administrator-capability rules. Existing RLS policies call these helpers.
create or replace function public.current_user_has_role(p_role public.app_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_profile_is_active()
    and (
      exists (
        select 1 from public.user_roles
        where user_id = (select auth.uid()) and role = p_role
      )
      or (
        p_role = 'administrator'::public.app_role
        and exists (
          select 1 from public.user_capabilities
          where user_id = (select auth.uid())
            and capability = 'administer_system'::public.user_capability
        )
      )
    );
$$;

create or replace function public.can_access_brand(p_brand_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_profile_is_active()
    and (
      exists (
        select 1 from public.user_brand_access
        where user_id = (select auth.uid()) and brand_id = p_brand_id
      )
      or exists (
        select 1 from public.user_brand_permissions
        where user_id = (select auth.uid()) and brand_id = p_brand_id
      )
    );
$$;

create or replace function public.has_active_reporting_path(
  p_source_user_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive chain(user_id, all_active, path) as (
    select p_source_user_id,
      exists (select 1 from public.profiles p where p.id = p_source_user_id and p.is_active),
      array[p_source_user_id]::uuid[]
    union all
    select rl.supervisor_id,
      chain.all_active
        and exists (select 1 from public.profiles p where p.id = rl.supervisor_id and p.is_active),
      chain.path || rl.supervisor_id
    from public.reporting_lines rl
    join chain on chain.user_id = rl.user_id
    where not rl.supervisor_id = any(chain.path)
  )
  select exists (
    select 1 from chain
    where user_id = p_target_user_id and all_active
  );
$$;

create or replace function public.can_access_brand(p_brand_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_profile_is_active()
    and (
      exists (
        select 1 from public.user_brand_access
        where user_id = (select auth.uid()) and brand_id = p_brand_id
      )
      or exists (
        select 1
        from public.user_brand_permissions permission
        where permission.user_id = (select auth.uid())
          and permission.brand_id = p_brand_id
          and (
            permission.source_kind = 'direct'
            or public.has_active_reporting_path(permission.source_user_id, (select auth.uid()))
          )
      )
    );
$$;

create or replace function public.current_user_has_capability(
  p_capability public.user_capability
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_profile_is_active()
    and (
      (p_capability = 'administer_system'::public.user_capability
       and public.current_user_is_administrator_v2())
      or exists (
        select 1 from public.user_capabilities
        where user_id = (select auth.uid()) and capability = p_capability
      )
    );
$$;

create or replace function public.can_use_brand_capability(
  p_brand_id uuid,
  p_capability public.user_capability
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_profile_is_active()
    and exists (
      select 1
      from public.brands b
      join public.user_brand_permissions permission
        on permission.brand_id = b.id
       and permission.user_id = (select auth.uid())
       and permission.capability = p_capability
       and (
         permission.source_kind = 'direct'
         or public.has_active_reporting_path(permission.source_user_id, (select auth.uid()))
       )
      where b.id = p_brand_id and b.is_active
    );
$$;

create or replace function public.get_current_access_v2()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  profile_row public.profiles%rowtype;
begin
  select * into profile_row
  from public.profiles
  where id = actor_id and is_active;

  if not found then return null; end if;

  return jsonb_build_object(
    'userId', profile_row.id,
    'displayName', profile_row.display_name,
    'tier', profile_row.org_tier,
    'isAdministrator', public.current_user_is_administrator_v2(),
    'capabilities', coalesce((
      select jsonb_agg(capability order by capability)
      from (
        select uc.capability::text as capability
        from public.user_capabilities uc where uc.user_id = actor_id
        union
        select 'administer_system'::text
        where public.current_user_is_administrator_v2()
      ) capability_rows
    ), '[]'::jsonb),
    'supervisorId', (
      select rl.supervisor_id from public.reporting_lines rl where rl.user_id = actor_id
    ),
    'executiveId', (
      with recursive chain(user_id) as (
        select rl.supervisor_id from public.reporting_lines rl where rl.user_id = actor_id
        union all
        select rl.supervisor_id from public.reporting_lines rl
        join chain c on c.user_id = rl.user_id
      )
      select c.user_id from chain c
      join public.profiles executive on executive.id = c.user_id
      where executive.org_tier = 'executive'::public.org_tier limit 1
    ),
    'brands', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', brand.id, 'code', brand.code, 'name', brand.name,
          'capabilities', brand.capabilities, 'sources', brand.sources
        ) order by brand.code
      )
      from (
        select b.id, b.code, b.name,
          jsonb_agg(distinct permission.capability order by permission.capability) capabilities,
          jsonb_agg(distinct permission.source_kind order by permission.source_kind) sources
      from public.user_brand_permissions permission
      join public.brands b on b.id = permission.brand_id and b.is_active
      where permission.user_id = actor_id
        and (
          permission.source_kind = 'direct'
          or public.has_active_reporting_path(permission.source_user_id, actor_id)
        )
      group by b.id, b.code, b.name
      ) brand
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_manageable_users_v2()
returns table (
  id uuid,
  display_name text,
  is_active boolean,
  tier public.org_tier,
  supervisor_id uuid,
  capabilities public.user_capability[],
  direct_brands jsonb,
  inherited_brands jsonb,
  subordinate_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, p.is_active, p.org_tier, rl.supervisor_id,
    coalesce((select array_agg(uc.capability order by uc.capability)
      from public.user_capabilities uc where uc.user_id = p.id), '{}'::public.user_capability[]),
    coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name) order by b.code)
      from public.user_brand_permissions permission join public.brands b on b.id = permission.brand_id
      where permission.user_id = p.id and permission.source_kind = 'direct'), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'sourceUserId', permission.source_user_id) order by b.code)
      from public.user_brand_permissions permission join public.brands b on b.id = permission.brand_id
      where permission.user_id = p.id and permission.source_kind = 'inherited'
        and public.has_active_reporting_path(permission.source_user_id, p.id)), '[]'::jsonb),
    (select count(*) from public.reporting_lines children where children.supervisor_id = p.id)
  from public.profiles p
  left join public.reporting_lines rl on rl.user_id = p.id
  where public.current_user_is_administrator_v2()
  order by p.display_name;
$$;

create or replace function public.set_user_organization_v2(
  p_user_id uuid,
  p_tier public.org_tier,
  p_is_active boolean,
  p_supervisor_id uuid,
  p_capabilities public.user_capability[],
  p_brand_ids uuid[],
  p_correlation_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_profile public.profiles%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  before_payload jsonb;
  result_payload jsonb;
  brand_id uuid;
  audit_brand_ids uuid[];
  target_was_active_admin boolean;
begin
  if actor_id is not null then
    if not public.current_user_is_administrator_v2() then
      raise exception using errcode = '42501', message = 'ORGANIZATION_ADMIN_REQUIRED';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ORGANIZATION_ADMIN_REQUIRED';
  end if;

  if p_user_id is null or p_tier is null or p_is_active is null
    or p_correlation_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'ORGANIZATION_INPUT_INVALID';
  end if;

  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object(
    'tier', p_tier, 'isActive', p_is_active, 'supervisorId', p_supervisor_id,
    'capabilities', to_jsonb(coalesce(p_capabilities, '{}'::public.user_capability[])),
    'brandIds', to_jsonb(coalesce(p_brand_ids, '{}'::uuid[]))
  );
  select * into existing_action from public.action_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'set_user_organization_v2'
      or existing_action.resource_id <> p_user_id
      or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('v2-organization-invariant', 0)
  );
  select * into target_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORGANIZATION_USER_NOT_FOUND';
  end if;
  if actor_id = p_user_id and not p_is_active then
    raise exception using errcode = '42501', message = 'CANNOT_DEACTIVATE_SELF';
  end if;
  if actor_id = p_user_id and (
    target_profile.org_tier is distinct from p_tier
    or (select rl.supervisor_id from public.reporting_lines rl where rl.user_id = p_user_id)
      is distinct from p_supervisor_id
    or coalesce((
      select array_agg(uc.capability order by uc.capability)
      from public.user_capabilities uc where uc.user_id = p_user_id
    ), '{}'::public.user_capability[])
      is distinct from coalesce((
        select array_agg(requested_capability order by requested_capability)
        from unnest(coalesce(p_capabilities, '{}'::public.user_capability[])) requested_capability
      ), '{}'::public.user_capability[])
    or coalesce((
      select array_agg(distinct permission.brand_id order by permission.brand_id)
      from public.user_brand_permissions permission
      where permission.user_id = p_user_id and permission.source_kind = 'direct'
    ), '{}'::uuid[])
      is distinct from coalesce((
        select array_agg(requested_brand order by requested_brand)
        from unnest(coalesce(p_brand_ids, '{}'::uuid[])) requested_brand
      ), '{}'::uuid[])
  ) then
    raise exception using errcode = '42501', message = 'CANNOT_CHANGE_OWN_ORGANIZATION';
  end if;
  if p_is_active and p_tier in ('leader'::public.org_tier, 'manager'::public.org_tier)
    and p_supervisor_id is null then
    raise exception using errcode = 'P0001', message = 'ACTIVE_SUPERVISOR_REQUIRED';
  end if;
  if p_supervisor_id is not null then
    if p_supervisor_id = p_user_id then
      raise exception using errcode = 'P0001', message = 'REPORTING_CYCLE_DETECTED';
    end if;
    if not exists (select 1 from public.profiles supervisor where supervisor.id = p_supervisor_id and supervisor.is_active) then
      raise exception using errcode = 'P0001', message = 'SUPERVISOR_MUST_BE_ACTIVE';
    end if;
    if p_tier = 'leader'::public.org_tier and not exists (select 1 from public.profiles supervisor where supervisor.id = p_supervisor_id and supervisor.org_tier = 'manager'::public.org_tier) then
      raise exception using errcode = 'P0001', message = 'INVALID_SUPERVISOR_TIER';
    end if;
    if p_tier = 'manager'::public.org_tier and not exists (select 1 from public.profiles supervisor where supervisor.id = p_supervisor_id and supervisor.org_tier = 'executive'::public.org_tier) then
      raise exception using errcode = 'P0001', message = 'INVALID_SUPERVISOR_TIER';
    end if;
    if p_tier in ('employee_viewer'::public.org_tier, 'executive'::public.org_tier) then
      raise exception using errcode = 'P0001', message = 'SUPERVISOR_NOT_ALLOWED_FOR_TIER';
    end if;
    if exists (
      with recursive chain(user_id) as (
        select p_supervisor_id
        union all
        select rl.supervisor_id from public.reporting_lines rl join chain c on c.user_id = rl.user_id
      ) select 1 from chain where user_id = p_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'REPORTING_CYCLE_DETECTED';
    end if;
  end if;
  if exists (
    select 1
    from public.reporting_lines rl
    join public.profiles child on child.id = rl.user_id
    where rl.supervisor_id = p_user_id
      and child.is_active
      and (
        not p_is_active
        or (child.org_tier = 'leader'::public.org_tier and p_tier <> 'manager'::public.org_tier)
        or (child.org_tier = 'manager'::public.org_tier and p_tier <> 'executive'::public.org_tier)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_SUBORDINATES_REQUIRE_REASSIGNMENT';
  end if;
  target_was_active_admin := target_profile.is_active and (
    exists (
      select 1 from public.user_capabilities
      where user_id = p_user_id
        and capability = 'administer_system'::public.user_capability
    )
  );
  if target_was_active_admin and not p_is_active and not exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.is_active and admin_profile.id <> p_user_id
      and (
        exists (
          select 1 from public.user_capabilities uc
          where uc.user_id = admin_profile.id
            and uc.capability = 'administer_system'::public.user_capability
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'LAST_ACTIVE_ADMINISTRATOR_REQUIRED';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_brand_ids, '{}'::uuid[])) requested_brand
    where not exists (select 1 from public.brands b where b.id = requested_brand and b.is_active)
  ) then
    raise exception using errcode = 'P0001', message = 'BRAND_NOT_FOUND';
  end if;

  before_payload := jsonb_build_object(
    'userId', p_user_id,
    'tier', target_profile.org_tier,
    'isActive', target_profile.is_active,
    'supervisorId', (
      select rl.supervisor_id from public.reporting_lines rl where rl.user_id = p_user_id
    ),
    'capabilities', coalesce((
      select jsonb_agg(uc.capability::text order by uc.capability)
      from public.user_capabilities uc where uc.user_id = p_user_id
    ), '[]'::jsonb),
    'brandIds', coalesce((
      select jsonb_agg(permission.brand_id order by permission.brand_id)
      from public.user_brand_permissions permission
      where permission.user_id = p_user_id and permission.source_kind = 'direct'
    ), '[]'::jsonb)
  );
  select coalesce(array_agg(permission.brand_id), '{}'::uuid[])
    into audit_brand_ids
  from public.user_brand_permissions permission
  where permission.user_id = p_user_id and permission.source_kind = 'direct';
  select coalesce(array_agg(distinct requested_brand), '{}'::uuid[])
    into audit_brand_ids
  from unnest(audit_brand_ids || coalesce(p_brand_ids, '{}'::uuid[])) requested_brand;

  update public.profiles set org_tier = p_tier, is_active = p_is_active, updated_at = now() where id = p_user_id;
  delete from public.reporting_lines where user_id = p_user_id;
  if p_supervisor_id is not null then insert into public.reporting_lines(user_id, supervisor_id) values(p_user_id, p_supervisor_id); end if;
  delete from public.user_capabilities where user_id = p_user_id;
  insert into public.user_capabilities(user_id, capability)
  select p_user_id, capability from unnest(coalesce(p_capabilities, '{}'::public.user_capability[])) capability on conflict do nothing;
  delete from public.user_brand_permissions where user_id = p_user_id;
  insert into public.user_brand_permissions(user_id, brand_id, capability, source_kind, source_user_id)
  select p_user_id, requested_brand.requested_brand_id, requested_capability.capability, 'direct', p_user_id
  from unnest(coalesce(p_brand_ids, '{}'::uuid[])) as requested_brand(requested_brand_id)
  cross join unnest(coalesce(p_capabilities, '{}'::public.user_capability[])) as requested_capability(capability)
  on conflict do nothing;
  delete from public.user_brand_permissions where source_kind = 'inherited';
  insert into public.user_brand_permissions(user_id, brand_id, capability, source_kind, source_user_id)
  with recursive ancestry(ancestor_id, source_user_id) as (
    select rl.supervisor_id, rl.user_id
    from public.reporting_lines rl
    join public.profiles source_edge on source_edge.id = rl.user_id and source_edge.is_active
    join public.profiles supervisor_edge on supervisor_edge.id = rl.supervisor_id and supervisor_edge.is_active
    union all
    select rl.supervisor_id, ancestry.source_user_id
    from public.reporting_lines rl
    join ancestry on ancestry.ancestor_id = rl.user_id
    join public.profiles source_edge on source_edge.id = rl.user_id and source_edge.is_active
    join public.profiles supervisor_edge on supervisor_edge.id = rl.supervisor_id and supervisor_edge.is_active
  )
  select ancestry.ancestor_id, direct.brand_id, direct.capability, 'inherited', ancestry.source_user_id
  from ancestry
  join public.profiles ancestor_profile
    on ancestor_profile.id = ancestry.ancestor_id and ancestor_profile.is_active
  join public.profiles source_profile
    on source_profile.id = ancestry.source_user_id and source_profile.is_active
  join public.user_brand_permissions direct
    on direct.user_id = ancestry.source_user_id and direct.source_kind = 'direct'
  on conflict do nothing;

  result_payload := jsonb_build_object('userId', p_user_id, 'request', request_payload, 'updated', true, 'correlationId', p_correlation_id);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values(p_idempotency_key, 'set_user_organization_v2', p_user_id, result_payload, actor_id);
  foreach brand_id in array audit_brand_ids loop
    perform public.write_audit_event(brand_id, 'organization_access_changed', 'profile', p_user_id, p_idempotency_key, before_payload, request_payload, jsonb_build_object('correlationId', p_correlation_id, 'source', 'v2'));
  end loop;
  return result_payload;
end;
$$;

-- Atomically reassign a Manager/Executive's direct reports and any pending
-- approval steps already assigned to that user before deactivation.
create or replace function public.replace_user_supervisor_v2(
  p_target_user_id uuid,
  p_replacement_user_id uuid,
  p_correlation_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_profile public.profiles%rowtype;
  replacement_profile public.profiles%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
  transferred_user_ids uuid[];
  transferred_user_id uuid;
  audit_brand_id uuid;
  approval_reassigned_count integer := 0;
  canonical_idempotency_key uuid := gen_random_uuid();
begin
  if actor_id is not null then
    if not public.current_user_is_administrator_v2() then
      raise exception using errcode = '42501', message = 'ORGANIZATION_ADMIN_REQUIRED';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ORGANIZATION_ADMIN_REQUIRED';
  end if;

  if p_target_user_id is null or p_replacement_user_id is null
    or p_correlation_id is null or p_idempotency_key is null
    or p_target_user_id = p_replacement_user_id then
    raise exception using errcode = 'P0001', message = 'ORGANIZATION_INPUT_INVALID';
  end if;

  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('targetUserId', p_target_user_id, 'replacementUserId', p_replacement_user_id);
  select * into existing_action from public.action_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'replace_user_supervisor_v2'
      or existing_action.resource_id <> p_target_user_id
      or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('v2-organization-invariant', 0)
  );

  -- Lock both profiles deterministically so concurrent replacements cannot
  -- create a transient hierarchy that escapes the invariant checks.
  perform 1
  from public.profiles p
  where p.id in (p_target_user_id, p_replacement_user_id)
  order by p.id
  for update;
  select p.* into target_profile from public.profiles p where p.id = p_target_user_id;
  select p.* into replacement_profile from public.profiles p where p.id = p_replacement_user_id for update;
  if target_profile.id is null or replacement_profile.id is null then
    raise exception using errcode = 'P0001', message = 'ORGANIZATION_USER_NOT_FOUND';
  end if;
  if not target_profile.is_active
    or target_profile.org_tier not in ('manager'::public.org_tier, 'executive'::public.org_tier) then
    raise exception using errcode = 'P0001', message = 'REPLACEMENT_TARGET_MUST_BE_ACTIVE_MANAGER_OR_EXECUTIVE';
  end if;
  if not replacement_profile.is_active or replacement_profile.org_tier <> target_profile.org_tier then
    raise exception using errcode = 'P0001', message = 'REPLACEMENT_MUST_BE_ACTIVE_SAME_TIER';
  end if;
  if target_profile.org_tier = 'executive'::public.org_tier
    and exists (
      select 1 from public.reporting_lines rl where rl.user_id = p_replacement_user_id
    ) then
    raise exception using errcode = 'P0001', message = 'REPLACEMENT_SUPERVISOR_INVALID';
  end if;
  if target_profile.org_tier = 'manager'::public.org_tier
    and not exists (
      select 1 from public.reporting_lines rl
      join public.profiles supervisor on supervisor.id = rl.supervisor_id
      where rl.user_id = p_replacement_user_id
        and supervisor.is_active and supervisor.org_tier = 'executive'::public.org_tier
    ) then
    raise exception using errcode = 'P0001', message = 'REPLACEMENT_SUPERVISOR_INVALID';
  end if;
  if exists (
    select 1
    from public.reporting_lines rl
    join public.profiles child on child.id = rl.user_id
    where rl.supervisor_id = p_target_user_id
      and child.is_active
      and (
        (target_profile.org_tier = 'manager'::public.org_tier and child.org_tier <> 'leader'::public.org_tier)
        or (target_profile.org_tier = 'executive'::public.org_tier and child.org_tier <> 'manager'::public.org_tier)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'REPLACEMENT_SUBORDINATE_TIER_INVALID';
  end if;
  if exists (
    with recursive chain(user_id) as (
      select p_replacement_user_id
      union all
      select rl.supervisor_id
      from public.reporting_lines rl
      join chain c on c.user_id = rl.user_id
    ) select 1 from chain where user_id = p_target_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'REPORTING_CYCLE_DETECTED';
  end if;

  select coalesce(array_agg(rl.user_id order by rl.user_id), '{}'::uuid[])
    into transferred_user_ids
  from public.reporting_lines rl
  join public.profiles child on child.id = rl.user_id
  where rl.supervisor_id = p_target_user_id;
  -- An Executive can be replaced even without direct reports when the
  -- operation only needs to transfer pending level-2 decisions. Managers,
  -- however, still require at least one direct report for this command.
  if target_profile.org_tier = 'manager'::public.org_tier
    and coalesce(array_length(transferred_user_ids, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'NO_DIRECT_REPORTS_TO_REPLACE';
  end if;

  update public.reporting_lines
  set supervisor_id = p_replacement_user_id, updated_at = now()
  where supervisor_id = p_target_user_id;
  update public.approval_steps
  set assigned_user_id = p_replacement_user_id, updated_at = now()
  where assigned_user_id = p_target_user_id
    and status in ('waiting'::public.approval_step_status, 'pending'::public.approval_step_status);
  get diagnostics approval_reassigned_count = row_count;

  -- V2 purchase proposals carry their assignees on the proposal row rather
  -- than in the legacy approval_steps table. Keep pending V2 work attached to
  -- the replacement in the same transaction as the hierarchy change.
  if target_profile.org_tier = 'manager'::public.org_tier then
    update public.purchase_proposals
    set assigned_manager_id = p_replacement_user_id, updated_at = now()
    where assigned_manager_id = p_target_user_id
      and status in ('pending_manager', 'pending_executive');
  elsif target_profile.org_tier = 'executive'::public.org_tier then
    update public.purchase_proposals
    set assigned_executive_id = p_replacement_user_id, updated_at = now()
    where assigned_executive_id = p_target_user_id
      and status = 'pending_executive';
  end if;

  -- Reuse the canonical command for deactivation and its audit/idempotency
  -- guarantees. Direct capabilities/brands are cleared on deactivation.
  result_payload := public.set_user_organization_v2(
    p_target_user_id,
    target_profile.org_tier,
    false,
    null,
    '{}'::public.user_capability[],
    '{}'::uuid[],
    p_correlation_id,
    canonical_idempotency_key
  );
  result_payload := result_payload || jsonb_build_object(
    'request', request_payload,
    'transferredUserIds', to_jsonb(transferred_user_ids),
    'approvalReassignedCount', approval_reassigned_count
  );
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values(p_idempotency_key, 'replace_user_supervisor_v2', p_target_user_id, result_payload, actor_id);
  foreach transferred_user_id in array transferred_user_ids loop
    foreach audit_brand_id in array (
      select coalesce(array_agg(distinct brand_id), '{}'::uuid[])
      from public.user_brand_permissions
      where user_id = transferred_user_id
    ) loop
      perform public.write_audit_event(
        audit_brand_id,
        'organization_hierarchy_reassigned',
        'profile',
        transferred_user_id,
        p_idempotency_key,
        jsonb_build_object('supervisorId', p_target_user_id),
        jsonb_build_object('supervisorId', p_replacement_user_id),
        jsonb_build_object('correlationId', p_correlation_id, 'approvalReassignedCount', approval_reassigned_count)
      );
    end loop;
  end loop;
  return result_payload;
end;
$$;

create or replace function public.set_user_organization_v2(
  p_user_id uuid, p_tier public.org_tier, p_is_active boolean, p_supervisor_id uuid,
  p_capabilities public.user_capability[], p_brand_ids uuid[], p_idempotency_key uuid
)
returns jsonb language sql security definer set search_path = ''
as $$
  select public.set_user_organization_v2(p_user_id, p_tier, p_is_active, p_supervisor_id, p_capabilities, p_brand_ids, p_idempotency_key, p_idempotency_key);
$$;

revoke all on function public.current_profile_is_active() from public, anon;
revoke all on function public.current_user_is_administrator_v2() from public, anon;
revoke all on function public.current_user_has_capability(public.user_capability) from public, anon;
revoke all on function public.has_active_reporting_path(uuid, uuid) from public, anon;
revoke all on function public.can_use_brand_capability(uuid, public.user_capability) from public, anon;
revoke all on function public.get_current_access_v2() from public, anon;
revoke all on function public.list_manageable_users_v2() from public, anon;
revoke all on function public.set_user_organization_v2(uuid, public.org_tier, boolean, uuid, public.user_capability[], uuid[], uuid, uuid) from public, anon;
revoke all on function public.set_user_organization_v2(uuid, public.org_tier, boolean, uuid, public.user_capability[], uuid[], uuid) from public, anon;
revoke all on function public.replace_user_supervisor_v2(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.current_profile_is_active() to authenticated, service_role;
grant execute on function public.current_user_is_administrator_v2() to authenticated, service_role;
grant execute on function public.current_user_has_capability(public.user_capability) to authenticated, service_role;
grant execute on function public.has_active_reporting_path(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_use_brand_capability(uuid, public.user_capability) to authenticated, service_role;
grant execute on function public.get_current_access_v2() to authenticated, service_role;
grant execute on function public.list_manageable_users_v2() to authenticated, service_role;
grant execute on function public.set_user_organization_v2(uuid, public.org_tier, boolean, uuid, public.user_capability[], uuid[], uuid, uuid) to authenticated, service_role;
grant execute on function public.set_user_organization_v2(uuid, public.org_tier, boolean, uuid, public.user_capability[], uuid[], uuid) to authenticated, service_role;
grant execute on function public.replace_user_supervisor_v2(uuid, uuid, uuid, uuid) to authenticated, service_role;

alter table public.reporting_lines enable row level security;
alter table public.user_capabilities enable row level security;
alter table public.user_brand_permissions enable row level security;
drop policy if exists reporting_lines_select_v2 on public.reporting_lines;
create policy reporting_lines_select_v2 on public.reporting_lines for select to authenticated using (public.current_profile_is_active() and (user_id = (select auth.uid()) or public.current_user_is_administrator_v2()));
drop policy if exists user_capabilities_select_v2 on public.user_capabilities;
create policy user_capabilities_select_v2 on public.user_capabilities for select to authenticated using (public.current_profile_is_active() and (user_id = (select auth.uid()) or public.current_user_is_administrator_v2()));
drop policy if exists user_brand_permissions_select_v2 on public.user_brand_permissions;
create policy user_brand_permissions_select_v2 on public.user_brand_permissions for select to authenticated using (
  public.current_profile_is_active()
  and (user_id = (select auth.uid()) or public.current_user_is_administrator_v2())
  and (
    source_kind = 'direct'
    or public.has_active_reporting_path(source_user_id, user_id)
  )
);
revoke all on table public.reporting_lines, public.user_capabilities, public.user_brand_permissions from anon, authenticated;
grant select on table public.reporting_lines, public.user_capabilities, public.user_brand_permissions to authenticated;
grant all on table public.reporting_lines, public.user_capabilities, public.user_brand_permissions to service_role;
revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid()) and public.current_profile_is_active()) with check (id = (select auth.uid()) and public.current_profile_is_active());

-- The legacy policy names predate V2. Keep them active-account aware so an
-- inactive session cannot read its own roles/brands or enumerate profiles.
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles for select to authenticated
using (public.current_profile_is_active() and (id = (select auth.uid()) or public.current_user_is_administrator_v2()));
drop policy if exists profiles_manage_admin on public.profiles;
drop policy if exists user_roles_select_own_or_admin on public.user_roles;
create policy user_roles_select_own_or_admin on public.user_roles for select to authenticated
using (public.current_profile_is_active() and (user_id = (select auth.uid()) or public.can_administer_user(user_id)));
drop policy if exists user_brand_access_select_own_or_admin on public.user_brand_access;
create policy user_brand_access_select_own_or_admin on public.user_brand_access for select to authenticated
using (public.current_profile_is_active() and (user_id = (select auth.uid()) or public.can_administer_user(user_id)));
