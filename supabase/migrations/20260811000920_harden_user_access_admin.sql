revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;
revoke insert, update, delete on table public.user_roles from authenticated;
revoke insert, update, delete on table public.user_brand_access from authenticated;

create function public.can_administer_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_role('administrator'::public.app_role)
    and not exists (
      select 1
      from public.user_brand_access
      where user_id = p_user_id
        and not public.can_administer_brand(brand_id)
    );
$$;

revoke all on function public.can_administer_user(uuid) from public, anon;
grant execute on function public.can_administer_user(uuid) to authenticated;

drop policy profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.can_administer_user(id)
);

drop policy profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()) and is_active)
with check (id = (select auth.uid()) and is_active);

drop policy profiles_manage_admin on public.profiles;
create policy profiles_manage_admin
on public.profiles
for all
to authenticated
using (public.can_administer_user(id))
with check (public.can_administer_user(id));

drop policy user_roles_select_own_or_admin on public.user_roles;
create policy user_roles_select_own_or_admin
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_administer_user(user_id)
);

drop policy user_roles_manage_admin on public.user_roles;
create policy user_roles_manage_admin
on public.user_roles
for all
to authenticated
using (public.can_administer_user(user_id))
with check (public.can_administer_user(user_id));

drop policy user_brand_access_select_own_or_admin on public.user_brand_access;
create policy user_brand_access_select_own_or_admin
on public.user_brand_access
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_administer_user(user_id)
);

drop policy user_brand_access_manage_admin on public.user_brand_access;
create policy user_brand_access_manage_admin
on public.user_brand_access
for all
to authenticated
using (public.can_administer_user(user_id))
with check (
  public.can_administer_user(user_id)
  and public.can_administer_brand(brand_id)
);

drop function public.set_user_access(uuid, public.app_role[], uuid[], boolean);

create function public.set_user_access(
  p_user_id uuid,
  p_roles public.app_role[],
  p_brand_ids uuid[],
  p_is_active boolean,
  p_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_brand_id uuid;
  target_was_active_admin boolean;
  target_will_be_active_admin boolean;
  existing_action public.action_idempotency%rowtype;
  before_roles jsonb;
  before_brand_ids jsonb;
  before_active boolean;
begin
  if actor_id is not null then
    if not public.current_user_has_role('administrator'::public.app_role) then
      raise exception using errcode = '42501', message = 'user_access_admin_required';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'user_access_admin_required';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id)
    or coalesce(array_length(p_roles, 1), 0) = 0
    or coalesce(array_length(p_brand_ids, 1), 0) = 0
    or array_position(p_roles, null) is not null
    or array_position(p_brand_ids, null) is not null
    or p_is_active is null then
    raise exception using errcode = 'P0001', message = 'user_access_invalid';
  end if;

  if actor_id is not null and exists (
    select 1
    from public.user_brand_access
    where user_id = p_user_id
      and not public.can_administer_brand(brand_id)
  ) then
    raise exception using errcode = '42501', message = 'user_access_target_out_of_scope';
  end if;

  foreach target_brand_id in array p_brand_ids loop
    if not exists (select 1 from public.brands where id = target_brand_id and is_active) then
      raise exception using errcode = 'P0001', message = 'user_access_brand_not_found';
    end if;
    if actor_id is not null and not public.can_administer_brand(target_brand_id) then
      raise exception using errcode = '42501', message = 'user_access_admin_required';
    end if;
  end loop;

  perform public.lock_action_idempotency_key(p_idempotency_key);

  select * into existing_action
  from public.action_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'set_user_access'
      or existing_action.resource_id <> p_user_id
      or existing_action.result -> 'request' <> jsonb_build_object(
        'roles', to_jsonb(p_roles),
        'brandIds', to_jsonb(p_brand_ids),
        'isActive', p_is_active
      ) then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return true;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('active-administrator-invariant', 0)
  );

  if actor_id = p_user_id and (
    not p_is_active
    or not ('administrator'::public.app_role = any(p_roles))
  ) then
    raise exception using errcode = '42501', message = 'cannot_remove_own_admin';
  end if;

  select profiles.is_active and exists (
    select 1 from public.user_roles
    where user_roles.user_id = p_user_id
      and user_roles.role = 'administrator'
  ), profiles.is_active
  into target_was_active_admin, before_active
  from public.profiles
  where profiles.id = p_user_id;

  target_will_be_active_admin :=
    p_is_active and ('administrator'::public.app_role = any(p_roles));

  if target_was_active_admin and not target_will_be_active_admin and not exists (
    select 1
    from public.user_roles
    join public.profiles on profiles.id = user_roles.user_id
    where user_roles.role = 'administrator'
      and profiles.is_active
      and user_roles.user_id <> p_user_id
  ) then
    raise exception using errcode = '42501', message = 'last_administrator_required';
  end if;

  select coalesce(jsonb_agg(role order by role), '[]'::jsonb)
  into before_roles
  from public.user_roles
  where user_id = p_user_id;

  select coalesce(jsonb_agg(brand_id order by brand_id), '[]'::jsonb)
  into before_brand_ids
  from public.user_brand_access
  where user_id = p_user_id;

  update public.profiles set is_active = p_is_active, updated_at = now()
  where id = p_user_id;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role)
  select p_user_id, role
  from unnest(p_roles) as role
  group by role;

  delete from public.user_brand_access where user_id = p_user_id;
  insert into public.user_brand_access (user_id, brand_id)
  select p_user_id, brand_id
  from unnest(p_brand_ids) as brand_id
  group by brand_id;

  insert into public.action_idempotency (
    idempotency_key, action_type, resource_id, result, created_by
  ) values (
    p_idempotency_key,
    'set_user_access',
    p_user_id,
    jsonb_build_object(
      'updated', true,
      'request', jsonb_build_object(
        'roles', to_jsonb(p_roles),
        'brandIds', to_jsonb(p_brand_ids),
        'isActive', p_is_active
      )
    ),
    actor_id
  );

  foreach target_brand_id in array (
    select coalesce(array_agg(distinct brand_id), '{}'::uuid[])
    from (
      select jsonb_array_elements_text(before_brand_ids)::uuid as brand_id
      union
      select unnest(p_brand_ids) as brand_id
    ) as audit_brands
  ) loop
    perform public.write_audit_event(
      target_brand_id,
      'user_access_changed',
      'profile',
      p_user_id,
      p_idempotency_key,
      jsonb_build_object(
        'roles', before_roles,
        'brandIds', before_brand_ids,
        'isActive', before_active
      ),
      jsonb_build_object(
        'roles', to_jsonb(p_roles),
        'brandIds', to_jsonb(p_brand_ids),
        'isActive', p_is_active
      ),
      jsonb_build_object('correlationId', p_idempotency_key)
    );
  end loop;

  return true;
end;
$$;

revoke all on function public.set_user_access(
  uuid, public.app_role[], uuid[], boolean, uuid
) from public, anon;
grant execute on function public.set_user_access(
  uuid, public.app_role[], uuid[], boolean, uuid
) to authenticated, service_role;

comment on function public.set_user_access(
  uuid, public.app_role[], uuid[], boolean, uuid
) is
  'Idempotently and atomically replaces in-scope user access, preserves an active administrator, and writes brand-scoped audit events.';

create function public.list_manageable_user_access()
returns table (
  user_id uuid,
  display_name text,
  is_active boolean,
  roles public.app_role[],
  brand_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profiles.id,
    profiles.display_name,
    profiles.is_active,
    coalesce(
      array_agg(distinct user_roles.role)
        filter (where user_roles.role is not null),
      '{}'::public.app_role[]
    ),
    coalesce(
      array_agg(distinct user_brand_access.brand_id)
        filter (where user_brand_access.brand_id is not null),
      '{}'::uuid[]
    )
  from public.profiles
  left join public.user_roles on user_roles.user_id = profiles.id
  left join public.user_brand_access on user_brand_access.user_id = profiles.id
  where public.can_administer_user(profiles.id)
  group by profiles.id, profiles.display_name, profiles.is_active
  order by profiles.display_name;
$$;

revoke all on function public.list_manageable_user_access() from public, anon;
grant execute on function public.list_manageable_user_access() to authenticated;

comment on function public.list_manageable_user_access() is
  'Lists only users whose complete brand scope can be administered by the current active administrator.';
