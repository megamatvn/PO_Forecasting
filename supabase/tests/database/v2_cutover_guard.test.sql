begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select has_function(
  'public',
  'assert_v2_cutover_confirmed',
  array[]::text[],
  '20260817000900_v2_cutover_and_business_data_reset confirmation guard function exists'
);

select has_function(
  'public',
  'perform_v2_legacy_cutover',
  array[]::text[],
  'destructive cutover is registered as an explicit runner, not auto-executed by migration replay'
);

select throws_ok(
  $$ select public.assert_v2_cutover_confirmed() $$,
  'P0001',
  'V2_CUTOVER_BACKUP_CONFIRMATION_REQUIRED',
  'cutover aborts without the explicit backup confirmation token'
);

select throws_ok(
  $$ select public.perform_v2_legacy_cutover() $$,
  'P0001',
  'V2_CUTOVER_BACKUP_CONFIRMATION_REQUIRED',
  'destructive runner also aborts without the explicit backup confirmation token'
);

select set_config('app.v2_cutover_confirmed', 'BUSINESS_DATA_BACKED_UP', true);

select lives_ok(
  $$ select public.assert_v2_cutover_confirmed() $$,
  'cutover confirmation guard accepts the exact controlled token'
);

select has_table('public', 'profiles', 'profiles are retained');
select has_table('public', 'brands', 'brands table is retained');
select has_table('public', 'products', 'products table is retained');
select has_table('public', 'sku_aliases', 'sku aliases table is retained');
select has_table('public', 'action_idempotency', 'action idempotency infrastructure is retained');
select has_table('public', 'audit_events', 'audit table is retained');
select has_table('public', 'user_capabilities', 'V2 capabilities table is retained');
select has_table('public', 'user_brand_permissions', 'V2 brand permissions table is retained');
select has_table('public', 'proposal_approval_policies', 'V2 proposal policy table is retained');
select has_table('public', 'proposal_approval_policy_brands', 'V2 proposal policy brand scope is retained');

select results_eq(
  $$
    select array_agg(uc.capability::text order by uc.capability::text)::text[]
    from public.user_capabilities uc
    join auth.users u on u.id = uc.user_id
    where lower(u.email) = 'admin@sagen-groupe.com'
  $$,
  $$ values (
    array[
      'administer_system',
      'create_annual_plan',
      'create_purchase_proposal',
      'manage_master_data',
      'view_approved_plan'
    ]::text[]
  ) $$,
  'retained Admin capability baseline is read from the database and is complete'
);

select ok(
  to_regclass('public.import_issues') is not null
  or to_regclass('public.annual_plan_cycles') is not null,
  'test database is pre-cutover or V2-ready; production cutover is not executed by pgTAP'
);

select has_table('public', 'annual_plan_cycles', 'V2 annual-plan table remains part of the kept contract');
select has_table('public', 'purchase_proposals', 'V2 proposal table remains part of the kept contract');
select has_table('public', 'workflow_approval_cases', 'V2 workflow cases remain part of the kept contract');
select has_table('public', 'notifications', 'V2 notifications remain part of the kept contract');
select has_table('public', 'notification_outbox', 'V2 notification outbox remains part of the kept contract');

select * from finish();
rollback;
