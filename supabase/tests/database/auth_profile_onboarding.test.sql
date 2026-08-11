begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

select has_trigger(
  'auth',
  'users',
  'auth_user_profile_onboarding',
  'auth user onboarding trigger exists'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '90000000-0000-0000-0000-000000000094',
  'onboarding@local.test',
  '{"display_name":"Onboarding Test"}'::jsonb
);

select is(
  (
    select display_name
    from public.profiles
    where id = '90000000-0000-0000-0000-000000000094'
  ),
  'Onboarding Test',
  'new auth users receive an application profile automatically'
);

select * from finish();

rollback;
