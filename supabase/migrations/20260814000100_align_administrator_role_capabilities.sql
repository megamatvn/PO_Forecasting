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
      and (
        user_roles.role = p_role
        or user_roles.role = 'administrator'::public.app_role
      )
      and profiles.is_active
  );
$$;

comment on function public.current_user_has_role(public.app_role) is
  'Returns role capabilities only for an active profile. Administrator inherits every application role capability; deactivation takes effect across RLS and RPC checks.';
