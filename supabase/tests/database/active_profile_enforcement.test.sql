begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

insert into auth.users (id, email)
values ('90000000-0000-0000-0000-000000000098', 'inactive-test@local.test');

update public.profiles
set display_name = 'Inactive Test', is_active = false
where id = '90000000-0000-0000-0000-000000000098';

insert into public.user_roles (user_id, role)
values ('90000000-0000-0000-0000-000000000098', 'administrator');

insert into public.user_brand_access (user_id, brand_id)
values (
  '90000000-0000-0000-0000-000000000098',
  '10000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000098',
  true
);

select is(
  public.current_user_has_role('administrator'),
  false,
  'an inactive profile has no effective role'
);

select is(
  public.can_access_brand('10000000-0000-0000-0000-000000000001'),
  false,
  'an inactive profile has no effective brand access'
);

reset role;

select * from finish();

rollback;
