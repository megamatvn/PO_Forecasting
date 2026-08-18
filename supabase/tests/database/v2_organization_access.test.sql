begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

select has_table('public', 'reporting_lines', 'reporting lines table exists');
select has_table('public', 'user_capabilities', 'organization capabilities table exists');
select has_table('public', 'user_brand_permissions', 'brand capability table exists');
select has_column('public'::name, 'approval_steps'::name, 'assigned_user_id'::name, 'pending approval steps can track an exact assignee');
select has_function(
  'public',
  'set_user_organization_v2',
  array['uuid', 'org_tier', 'boolean', 'uuid', 'user_capability[]', 'uuid[]', 'uuid', 'uuid']::text[],
  'canonical organization command has correlation and idempotency keys'
);
select has_function(
  'public',
  'set_user_organization_v2',
  array['uuid', 'org_tier', 'boolean', 'uuid', 'user_capability[]', 'uuid[]', 'uuid']::text[],
  'compatibility organization command keeps the seven-argument contract'
);
select has_function(
  'public',
  'replace_user_supervisor_v2',
  array['uuid', 'uuid', 'uuid', 'uuid']::text[],
  'replacement command atomically transfers direct reports'
);

insert into public.brands (id, code, name, is_active)
values ('10000000-0000-0000-0000-000000000101', 'V2', 'V2 Test Brand', true);

insert into auth.users (id, email)
values
  ('90000000-0000-0000-0000-000000000101', 'v2-admin@local.test'),
  ('90000000-0000-0000-0000-000000000102', 'v2-executive@local.test'),
  ('90000000-0000-0000-0000-000000000103', 'v2-manager@local.test'),
  ('90000000-0000-0000-0000-000000000104', 'v2-leader@local.test'),
  ('90000000-0000-0000-0000-000000000105', 'v2-inactive@local.test'),
  ('90000000-0000-0000-0000-000000000106', 'v2-replacement-manager@local.test'),
  ('90000000-0000-0000-0000-000000000107', 'v2-last-admin@local.test');

insert into public.user_roles (user_id, role)
values ('90000000-0000-0000-0000-000000000101', 'administrator');

update public.profiles
set display_name = replace(display_name, 'v2-', 'V2 ')
where id in (
  '90000000-0000-0000-0000-000000000101',
  '90000000-0000-0000-0000-000000000102',
  '90000000-0000-0000-0000-000000000103',
  '90000000-0000-0000-0000-000000000104',
  '90000000-0000-0000-0000-000000000105',
  '90000000-0000-0000-0000-000000000106',
  '90000000-0000-0000-0000-000000000107'
);

insert into public.user_capabilities (user_id, capability)
values ('90000000-0000-0000-0000-000000000101', 'administer_system');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.current_user_is_administrator_v2(),
  true,
  'a legacy Administrator is an active V2 administrator'
);

select throws_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000104',
      'leader'::public.org_tier,
      true,
      '90000000-0000-0000-0000-000000000103',
      array['create_purchase_proposal']::public.user_capability[],
      array['10000000-0000-0000-0000-000000000101']::uuid[],
      '81000000-0000-0000-0000-000000000104'::uuid,
      '82000000-0000-0000-0000-000000000104'::uuid
    )
  $$,
  'P0001',
  'INVALID_SUPERVISOR_TIER',
  'a Leader cannot report to an unconfigured employee'
);

select throws_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000103',
      'manager'::public.org_tier,
      true,
      null,
      array['create_annual_plan']::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000103'::uuid,
      '82000000-0000-0000-0000-000000000103'::uuid
    )
  $$,
  'P0001',
  'ACTIVE_SUPERVISOR_REQUIRED',
  'an active Manager must have a supervisor'
);

select throws_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000103',
      'manager'::public.org_tier,
      true,
      '90000000-0000-0000-0000-000000000104',
      array['create_annual_plan']::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000103'::uuid,
      '82000000-0000-0000-0000-000000000103'::uuid
    )
  $$,
  'P0001',
  'INVALID_SUPERVISOR_TIER',
  'a Manager cannot report to a Leader'
);

select lives_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000102',
      'executive'::public.org_tier,
      true,
      null,
      array['create_annual_plan']::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000102'::uuid,
      '82000000-0000-0000-0000-000000000102'::uuid
    )
  $$,
  'an Administrator can assign an active Executive without a supervisor'
);

select lives_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000103',
      'manager'::public.org_tier,
      true,
      '90000000-0000-0000-0000-000000000102',
      array['create_annual_plan']::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000103'::uuid,
      '82000000-0000-0000-0000-000000000103'::uuid
    )
  $$,
  'an Administrator can assign a Manager to an Executive'
);

select lives_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000104',
      'leader'::public.org_tier,
      true,
      '90000000-0000-0000-0000-000000000103',
      array['create_purchase_proposal']::public.user_capability[],
      array['10000000-0000-0000-0000-000000000101']::uuid[],
      '81000000-0000-0000-0000-000000000114'::uuid,
      '82000000-0000-0000-0000-000000000114'::uuid
    )
  $$,
  'an Administrator can assign a Leader to the configured Manager'
);

select is(
  (select supervisor_id from public.reporting_lines where user_id = '90000000-0000-0000-0000-000000000104'),
  '90000000-0000-0000-0000-000000000103'::uuid,
  'the Leader reports to the assigned Manager'
);

select is(
  (select count(*) from public.user_brand_permissions
    where user_id = '90000000-0000-0000-0000-000000000103'
      and source_kind = 'inherited'
      and source_user_id = '90000000-0000-0000-0000-000000000104'),
  1::bigint,
  'brand scope is inherited upward from Leader to Manager'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000103', true);
select is(
  public.can_use_brand_capability(
    '10000000-0000-0000-0000-000000000101'::uuid,
    'create_purchase_proposal'::public.user_capability
  ),
  true,
  'the Manager can use the Leader inherited brand capability'
);

reset role;
update public.profiles set is_active = false where id = '90000000-0000-0000-0000-000000000104';
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000103', true);
select is(
  public.can_use_brand_capability(
    '10000000-0000-0000-0000-000000000101'::uuid,
    'create_purchase_proposal'::public.user_capability
  ),
  false,
  'an inherited capability is denied when an intermediate source becomes inactive'
);
reset role;
update public.profiles set is_active = true where id = '90000000-0000-0000-0000-000000000104';
set local role authenticated;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000101', true);

select lives_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000106',
      'manager'::public.org_tier,
      true,
      '90000000-0000-0000-0000-000000000102',
      array['create_annual_plan']::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000106'::uuid,
      '82000000-0000-0000-0000-000000000106'::uuid
    )
  $$,
  'an Administrator can configure a replacement Manager'
);

select throws_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000106',
      'manager'::public.org_tier,
      true,
      '90000000-0000-0000-0000-000000000106',
      array['create_annual_plan']::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000206'::uuid,
      '82000000-0000-0000-0000-000000000206'::uuid
    )
  $$,
  'P0001',
  'REPORTING_CYCLE_DETECTED',
  'a user cannot report to themselves'
);

select lives_ok(
  $$
    select public.replace_user_supervisor_v2(
      '90000000-0000-0000-0000-000000000103'::uuid,
      '90000000-0000-0000-0000-000000000106'::uuid,
      '81000000-0000-0000-0000-000000000203'::uuid,
      '82000000-0000-0000-0000-000000000203'::uuid
    )
  $$,
  'replacement transfers a Manager hierarchy atomically before deactivation'
);

select is(
  (select is_active from public.profiles where id = '90000000-0000-0000-0000-000000000103'),
  false,
  'the replaced Manager is inactive after the transfer'
);

select is(
  (select supervisor_id from public.reporting_lines where user_id = '90000000-0000-0000-0000-000000000104'),
  '90000000-0000-0000-0000-000000000106'::uuid,
  'the Leader now reports to the replacement Manager'
);

select lives_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000105',
      'employee_viewer'::public.org_tier,
      false,
      null,
      array['create_purchase_proposal']::public.user_capability[],
      array['10000000-0000-0000-0000-000000000101']::uuid[],
      '81000000-0000-0000-0000-000000000205'::uuid,
      '82000000-0000-0000-0000-000000000205'::uuid
    )
  $$,
  'an Administrator can deactivate an account through the organization command'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000105', true);
select is(public.current_profile_is_active(), false, 'an inactive session is not active');
select is(public.get_current_access_v2(), null::jsonb, 'an inactive session receives no V2 access context');
select is(
  (select count(*) from public.user_brand_permissions where user_id = '90000000-0000-0000-0000-000000000105'),
  0::bigint,
  'an inactive session cannot read its V2 permission rows'
);
select is(
  (select count(*) from public.profiles where id = '90000000-0000-0000-0000-000000000105'),
  0::bigint,
  'an inactive session cannot read its own profile through the Data API'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000101', true);

select throws_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000101',
      'executive'::public.org_tier,
      false,
      null,
      array['administer_system']::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000101'::uuid,
      '82000000-0000-0000-0000-000000000101'::uuid
    )
  $$,
  '42501',
  'CANNOT_DEACTIVATE_SELF',
  'an Administrator cannot deactivate their own account'
);

select throws_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000101',
      'executive'::public.org_tier,
      true,
      null,
      array['administer_system']::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000111'::uuid,
      '82000000-0000-0000-0000-000000000111'::uuid
    )
  $$,
  '42501',
  'CANNOT_CHANGE_OWN_ORGANIZATION',
  'an Administrator cannot change their own tier or organization assignment'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000104', true);
select throws_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000105',
      'employee_viewer'::public.org_tier,
      true,
      null,
      array[]::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000105'::uuid,
      '82000000-0000-0000-0000-000000000105'::uuid
    )
  $$,
  '42501',
  'ORGANIZATION_ADMIN_REQUIRED',
  'a non-Administrator cannot call the organization command'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000105', true);
select throws_ok(
  $$
    update public.profiles set is_active = false where id = '90000000-0000-0000-0000-000000000105'
  $$,
  '42501',
  'permission denied for table profiles',
  'a user cannot update sensitive profile columns directly'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000101', true);
select throws_ok(
  $$
    update public.profiles set is_active = false where id = '90000000-0000-0000-0000-000000000105'
  $$,
  '42501',
  'permission denied for table profiles',
  'even an Administrator must use the organization command for sensitive profile changes'
);

reset role;
delete from public.user_capabilities where capability = 'administer_system';
delete from public.user_roles where role = 'administrator';
insert into public.user_roles (user_id, role)
values ('90000000-0000-0000-0000-000000000107', 'administrator');
insert into public.user_capabilities (user_id, capability)
values ('90000000-0000-0000-0000-000000000107', 'administer_system');
set local role service_role;
reset request.jwt.claim.sub;
select throws_ok(
  $$
    select public.set_user_organization_v2(
      '90000000-0000-0000-0000-000000000107',
      'employee_viewer'::public.org_tier,
      false,
      null,
      array[]::public.user_capability[],
      array[]::uuid[],
      '81000000-0000-0000-0000-000000000207'::uuid,
      '82000000-0000-0000-0000-000000000207'::uuid
    )
  $$,
  '42501',
  'LAST_ACTIVE_ADMINISTRATOR_REQUIRED',
  'the last active Administrator cannot be deactivated'
);
reset role;

select * from finish();

rollback;
