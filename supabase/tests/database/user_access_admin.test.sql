begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_function(
  'public',
  'set_user_access',
  array['uuid', 'app_role[]', 'uuid[]', 'boolean', 'uuid'],
  'atomic user access RPC exists'
);

insert into auth.users (id, email)
values ('90000000-0000-0000-0000-000000000099', 'access-test@local.test');

update public.profiles
set display_name = 'Access Test'
where id = '90000000-0000-0000-0000-000000000099';

select lives_ok(
  $$
    select public.set_user_access(
      '90000000-0000-0000-0000-000000000099',
      array['planner', 'approver_l1']::public.app_role[],
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      true,
      '81000000-0000-0000-0000-000000000099'
    )
  $$,
  'roles and brand scope update in one transaction'
);

select results_eq(
  $$
    select role::text from public.user_roles
    where user_id = '90000000-0000-0000-0000-000000000099'
    order by role::text
  $$,
  $$ values ('approver_l1'::text), ('planner'::text) $$,
  'multiple roles are assigned'
);

select is(
  (
    select count(*) from public.user_brand_access
    where user_id = '90000000-0000-0000-0000-000000000099'
      and brand_id = '10000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'brand access is assigned exactly once'
);

select lives_ok(
  $$
    select public.set_user_access(
      '90000000-0000-0000-0000-000000000099',
      array['planner', 'approver_l1']::public.app_role[],
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      true,
      '81000000-0000-0000-0000-000000000099'
    )
  $$,
  'retrying the same access update is idempotent'
);

select is(
  (
    select count(*) from public.audit_events
    where event_type = 'user_access_changed'
      and entity_id = '90000000-0000-0000-0000-000000000099'
  ),
  1::bigint,
  'the access update writes one audit event despite retry'
);

insert into public.brands (id, code, name, is_active)
values ('10000000-0000-0000-0000-000000000099', 'AUD', 'Audit Scope', true);

select public.set_user_access(
  '90000000-0000-0000-0000-000000000099',
  array['planner']::public.app_role[],
  array[
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000099'
  ]::uuid[],
  true,
  '81000000-0000-0000-0000-000000000100'
);

select public.set_user_access(
  '90000000-0000-0000-0000-000000000099',
  array['planner']::public.app_role[],
  array['10000000-0000-0000-0000-000000000001']::uuid[],
  true,
  '81000000-0000-0000-0000-000000000101'
);

select is(
  (
    select count(*)
    from public.audit_events
    where idempotency_key = '81000000-0000-0000-0000-000000000101'
      and brand_id = '10000000-0000-0000-0000-000000000099'
  ),
  1::bigint,
  'removing brand access writes an audit event in the removed brand scope'
);

select throws_ok(
  $$
    select public.set_user_access(
      '90000000-0000-0000-0000-000000000099',
      array['viewer']::public.app_role[],
      array['10000000-0000-0000-0000-000000000001']::uuid[],
      true,
      '81000000-0000-0000-0000-000000000101'
    )
  $$,
  'P0001',
  'idempotency_key_reused',
  'reusing an access key with a different payload is rejected'
);

select * from finish();

rollback;
