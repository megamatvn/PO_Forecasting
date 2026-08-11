create function public.set_user_access(
  p_user_id uuid,
  p_roles public.app_role[],
  p_brand_ids uuid[],
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_brand_id uuid;
  target_was_admin boolean;
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
    or p_is_active is null then
    raise exception using errcode = 'P0001', message = 'user_access_invalid';
  end if;

  foreach target_brand_id in array p_brand_ids loop
    if not exists (select 1 from public.brands where id = target_brand_id and is_active) then
      raise exception using errcode = 'P0001', message = 'user_access_brand_not_found';
    end if;
    if actor_id is not null and not public.can_administer_brand(target_brand_id) then
      raise exception using errcode = '42501', message = 'user_access_admin_required';
    end if;
  end loop;

  if actor_id = p_user_id
    and not ('administrator'::public.app_role = any(p_roles)) then
    raise exception using errcode = '42501', message = 'cannot_remove_own_admin';
  end if;

  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'administrator'
  ) into target_was_admin;

  if target_was_admin
    and not ('administrator'::public.app_role = any(p_roles))
    and (select count(*) from public.user_roles where role = 'administrator') <= 1 then
    raise exception using errcode = '42501', message = 'last_administrator_required';
  end if;

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

  return true;
end;
$$;

revoke all on function public.set_user_access(uuid, public.app_role[], uuid[], boolean)
from public, anon;
grant execute on function public.set_user_access(uuid, public.app_role[], uuid[], boolean)
to authenticated, service_role;

comment on function public.set_user_access(uuid, public.app_role[], uuid[], boolean) is
  'Atomically replaces an existing user profile roles and brand scope; guards self and last-administrator removal.';
