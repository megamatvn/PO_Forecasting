begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function(
  'public',
  'list_manageable_user_access',
  array[]::text[],
  'scoped user access listing RPC exists'
);

insert into public.brands (id, code, name, is_active)
values ('10000000-0000-0000-0000-000000000095', 'SEC', 'Security Test', true);

insert into auth.users (id, email)
values
  ('90000000-0000-0000-0000-000000000095', 'scope-target@local.test'),
  ('90000000-0000-0000-0000-000000000096', 'scope-admin@local.test');

update public.profiles
set display_name = case id
  when '90000000-0000-0000-0000-000000000095' then 'Scope Target'
  else 'Scope Admin'
end
where id in (
  '90000000-0000-0000-0000-000000000095',
  '90000000-0000-0000-0000-000000000096'
);

insert into public.user_roles (user_id, role)
values
  ('90000000-0000-0000-0000-000000000095', 'viewer'),
  ('90000000-0000-0000-0000-000000000096', 'administrator');

insert into public.user_brand_access (user_id, brand_id)
values
  (
    '90000000-0000-0000-0000-000000000095',
    '10000000-0000-0000-0000-000000000095'
  ),
  (
    '90000000-0000-0000-0000-000000000096',
    '10000000-0000-0000-0000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000095',
  true
);

select throws_ok(
  $$
    update public.profiles
    set is_active = true
    where id = '90000000-0000-0000-0000-000000000095'
  $$,
  '42501',
  'permission denied for table profiles',
  'a user cannot reactivate their own profile through the Data API role'
);

select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000096',
  true
);

select is(
  (
    select count(*)
    from public.profiles
    where id = '90000000-0000-0000-0000-000000000095'
  ),
  0::bigint,
  'an administrator cannot select a user whose brand scope is outside their own'
);

select throws_ok(
  $$
    select public.set_user_access(
      '90000000-0000-0000-0000-000000000095',
      array['viewer']::public.app_role[],
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      true,
      '81000000-0000-0000-0000-000000000095'
    )
  $$,
  '42501',
  'user_access_target_out_of_scope',
  'a brand-scoped administrator cannot replace another scope'
);

select throws_ok(
  $$
    select public.set_user_access(
      '90000000-0000-0000-0000-000000000096',
      array['administrator']::public.app_role[],
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      false,
      '81000000-0000-0000-0000-000000000096'
    )
  $$,
  '42501',
  'cannot_remove_own_admin',
  'an administrator cannot deactivate their own profile'
);

reset role;

select * from finish();

rollback;
