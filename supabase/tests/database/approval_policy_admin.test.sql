begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_column(
  'public',
  'approval_policies',
  'escalation_flags',
  'approval policies store configured escalation flags'
);

select has_function(
  'public',
  'create_approval_policy',
  array['text', 'approval_mode', 'numeric', 'text', 'uuid[]', 'text[]', 'date', 'date'],
  'bulk approval policy RPC exists'
);

insert into public.brands (id, code, name, is_active)
values (
  '10000000-0000-0000-0000-000000000002',
  'ABC',
  'ABC',
  true
);

select lives_ok(
  $$
    select public.create_approval_policy(
      'Bulk threshold policy',
      'threshold',
      50000,
      'EUR',
      array[
        '10000000-0000-0000-0000-000000000001'::uuid,
        '10000000-0000-0000-0000-000000000002'::uuid
      ],
      array['criticalShortage'],
      current_date,
      null
    )
  $$,
  'an administrator can define one policy for multiple brands'
);

select is(
  (
    select count(*)
    from public.approval_policy_brands
    join public.approval_policies
      on approval_policies.id = approval_policy_brands.policy_id
    where approval_policies.name = 'Bulk threshold policy'
      and approval_policy_brands.is_active
  ),
  2::bigint,
  'bulk assignment creates one active row for each brand'
);

select is(
  (
    select escalation_flags
    from public.approval_policies
    where name = 'Bulk threshold policy'
  ),
  '["criticalShortage"]'::jsonb,
  'selected escalation flags are persisted'
);

insert into public.planning_cycles (
  id, brand_id, code, name, planning_year, currency_code, target_purchase_amount
)
values (
  '40000000-0000-0000-0000-000000000082',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2082-POLICY-ADMIN-TEST',
  'ETX policy admin test',
  2082,
  'EUR',
  1
);

insert into public.plan_versions (
  id, planning_cycle_id, version_number, status
)
values
  (
    '41000000-0000-0000-0000-000000000082',
    '40000000-0000-0000-0000-000000000082',
    1,
    'draft'
  ),
  (
    '41000000-0000-0000-0000-000000000083',
    '40000000-0000-0000-0000-000000000082',
    2,
    'draft'
  ),
  (
    '41000000-0000-0000-0000-000000000084',
    '40000000-0000-0000-0000-000000000082',
    3,
    'draft'
  );

select public.submit_plan(
  '41000000-0000-0000-0000-000000000082',
  '83000000-0000-0000-0000-000000000082',
  '{"newSupplier": true}'::jsonb
);

select results_eq(
  $$
    select required_levels, routing_reason, exception_flags
    from public.approval_requests
    where plan_version_id = '41000000-0000-0000-0000-000000000082'
  $$,
  $$ values (1::smallint, 'under_threshold'::text, '{}'::jsonb) $$,
  'an unconfigured exception flag cannot escalate threshold routing'
);

select public.submit_plan(
  '41000000-0000-0000-0000-000000000083',
  '83000000-0000-0000-0000-000000000083',
  '{"criticalShortage": true, "newSupplier": true}'::jsonb
);

select results_eq(
  $$
    select required_levels, routing_reason, exception_flags
    from public.approval_requests
    where plan_version_id = '41000000-0000-0000-0000-000000000083'
  $$,
  $$
    values (
      2::smallint,
      'exception'::text,
      '{"criticalShortage": true}'::jsonb
    )
  $$,
  'a configured exception escalates and the request snapshots filtered flags'
);

insert into public.purchase_batches (
  id, plan_version_id, batch_number, name, order_date, eta_date, status
)
values (
  '43000000-0000-0000-0000-000000000082',
  '41000000-0000-0000-0000-000000000084',
  1,
  'Budget exception',
  '2082-01-01',
  '2082-02-01',
  'planned'
);

insert into public.purchase_lines (
  purchase_batch_id, product_id, qty, foc_qty, ex_price
)
values (
  '43000000-0000-0000-0000-000000000082',
  '20000000-0000-0000-0000-000000000150',
  1,
  0,
  12.5
);

select public.submit_plan(
  '41000000-0000-0000-0000-000000000084',
  '83000000-0000-0000-0000-000000000084',
  '{}'::jsonb
);

select results_eq(
  $$
    select required_levels, routing_reason, exception_flags
    from public.approval_requests
    where plan_version_id = '41000000-0000-0000-0000-000000000084'
  $$,
  $$ values (2::smallint, 'exception'::text, '{"budgetOverrun": true}'::jsonb) $$,
  'server-derived budget overrun always escalates even when the policy does not list the flag'
);

select * from finish();

rollback;
