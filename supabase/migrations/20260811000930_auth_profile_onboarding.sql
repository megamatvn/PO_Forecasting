create function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Người dùng Sagen'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger auth_user_profile_onboarding
after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();

insert into public.profiles (id, display_name)
select
  users.id,
  coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Người dùng Sagen'
  )
from auth.users as users
on conflict (id) do nothing;

revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;

comment on function public.handle_new_auth_user_profile() is
  'Creates the application profile required for every newly provisioned Supabase Auth user.';
