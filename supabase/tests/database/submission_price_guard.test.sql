begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

select has_function(
  'public',
  'guard_plan_submission_price',
  array[]::text[],
  'submit price guard exists'
);

insert into public.planning_cycles (
  id, brand_id, code, name, planning_year
)
values (
  '40000000-0000-0000-0000-000000000085',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2085-PRICE-GUARD',
  'Missing price guard test',
  2085
);

insert into public.plan_versions (
  id, planning_cycle_id, version_number, status
)
values (
  '41000000-0000-0000-0000-000000000085',
  '40000000-0000-0000-0000-000000000085',
  1,
  'draft'
);

insert into public.purchase_batches (
  id, plan_version_id, batch_number, name, order_date, eta_date, status
)
values (
  '43000000-0000-0000-0000-000000000085',
  '41000000-0000-0000-0000-000000000085',
  1,
  'Missing price',
  '2085-01-01',
  '2085-02-01',
  'planned'
);

insert into public.purchase_lines (
  purchase_batch_id, product_id, qty, foc_qty, ex_price
)
values (
  '43000000-0000-0000-0000-000000000085',
  '20000000-0000-0000-0000-000000000150',
  1,
  0,
  0
);

select throws_ok(
  $$
    select public.submit_plan(
      '41000000-0000-0000-0000-000000000085',
      '82000000-0000-0000-0000-000000000085',
      '{}'::jsonb
    )
  $$,
  'P0001',
  'missing_ex_price',
  'Submit is blocked when a non-zero Qty has no Ex Price'
);

select is(
  (select count(*) from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000085'),
  0::bigint,
  'the blocked Submit creates no approval request'
);

select * from finish();

rollback;
