create or replace function public.current_user_has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    join public.profiles on profiles.id = user_roles.user_id
    where user_roles.user_id = (select auth.uid())
      and user_roles.role = p_role
      and profiles.is_active
  );
$$;

create or replace function public.can_access_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_brand_access
    join public.profiles on profiles.id = user_brand_access.user_id
    where user_brand_access.user_id = (select auth.uid())
      and user_brand_access.brand_id = p_brand_id
      and profiles.is_active
  );
$$;

comment on function public.current_user_has_role(public.app_role) is
  'Returns a role only for an active profile; deactivation takes effect across RLS and RPC checks.';
comment on function public.can_access_brand(uuid) is
  'Returns brand membership only for an active profile.';
