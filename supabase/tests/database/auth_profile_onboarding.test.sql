begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

select has_trigger(
  'auth',
  'users',
  'auth_user_profile_onboarding',
  'auth user onboarding trigger exists'
);

select is(
  (
    select count(*)::integer
    from auth.users
    where email like '%@local.test'
      and (
        confirmation_token is null
        or recovery_token is null
        or email_change_token_current is null
        or email_change_token_new is null
        or email_change is null
        or phone_change_token is null
        or phone_change is null
        or reauthentication_token is null
      )
  ),
  0,
  'local auth seed users use non-null token fields required by GoTrue'
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
