begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_function(
  'public',
  'save_planning_workspace',
  array['uuid', 'integer', 'jsonb', 'uuid'],
  'planning workspace save RPC exists'
);

insert into public.planning_cycles (
  id,
  brand_id,
  code,
  name,
  planning_year,
  currency_code
)
values (
  '40000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2081-WORKSPACE-TEST',
  'ETX planning workspace test',
  2081,
  'EUR'
);

insert into public.plan_versions (
  id,
  planning_cycle_id,
  version_number,
  status
)
values (
  '41000000-0000-0000-0000-000000000081',
  '40000000-0000-0000-0000-000000000081',
  1,
  'draft'
);

insert into public.plan_lines (
  id,
  plan_version_id,
  product_id,
  opening_stock,
  target_stock
)
values (
  '42000000-0000-0000-0000-000000000081',
  '41000000-0000-0000-0000-000000000081',
  '20000000-0000-0000-0000-000000000150',
  32,
  0
);

select is(
  public.save_planning_workspace(
    '41000000-0000-0000-0000-000000000081',
    0,
    jsonb_build_object(
      'purchaseProposals',
      jsonb_build_array(
        jsonb_build_object(
          'productId', '20000000-0000-0000-0000-000000000150',
          'qty', 2368,
          'focQty', 0,
          'exPrice', '2.71'
        )
      )
    ),
    '82000000-0000-0000-0000-000000000081'
  ),
  1,
  'a new ET-015150 proposal increments the Draft lock version'
);

select results_eq(
  $$
    select batch_number, status::text, currency_code
    from public.purchase_batches
    where plan_version_id = '41000000-0000-0000-0000-000000000081'
  $$,
  $$ values (1, 'planned'::text, 'EUR'::text) $$,
  'the first proposal creates one planned PO batch'
);

select results_eq(
  $$
    select qty, foc_qty, ex_price::numeric, amount::numeric
    from public.purchase_lines
    join public.purchase_batches
      on purchase_batches.id = purchase_lines.purchase_batch_id
    where purchase_batches.plan_version_id = '41000000-0000-0000-0000-000000000081'
      and product_id = '20000000-0000-0000-0000-000000000150'
  $$,
  $$ values (2368, 0, 2.71::numeric, 6417.28::numeric) $$,
  'the proposal persists Qty and generates Amount as Qty times Ex Price'
);

select is(
  public.save_planning_workspace(
    '41000000-0000-0000-0000-000000000081',
    0,
    jsonb_build_object(
      'purchaseProposals',
      jsonb_build_array(
        jsonb_build_object(
          'productId', '20000000-0000-0000-0000-000000000150',
          'qty', 2368,
          'focQty', 0,
          'exPrice', '2.71'
        )
      )
    ),
    '82000000-0000-0000-0000-000000000081'
  ),
  1,
  'retrying the same proposal returns the original lock version'
);

select is(
  (
    select count(*)
    from public.purchase_lines
    join public.purchase_batches
      on purchase_batches.id = purchase_lines.purchase_batch_id
    where purchase_batches.plan_version_id = '41000000-0000-0000-0000-000000000081'
  ),
  1::bigint,
  'retrying the same proposal creates no duplicate purchase line'
);

select throws_ok(
  $$
    select public.save_planning_workspace(
      '41000000-0000-0000-0000-000000000081',
      0,
      '{}'::jsonb,
      '82000000-0000-0000-0000-000000000082'
    )
  $$,
  'P0001',
  'PLAN_VERSION_CONFLICT',
  'a stale Draft save raises a compare-and-swap conflict'
);

select * from finish();

rollback;
