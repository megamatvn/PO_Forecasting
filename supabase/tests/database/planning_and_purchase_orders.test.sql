begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_table(
  'public',
  'purchase_batches',
  'dynamic purchase batches exist'
);
select has_column(
  'public',
  'purchase_lines',
  'amount',
  'purchase line Amount exists'
);
select ok(
  (
    select is_generated = 'ALWAYS'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchase_lines'
      and column_name = 'amount'
  ),
  'Amount is database-generated'
);

insert into public.planning_cycles (
  id,
  brand_id,
  code,
  name,
  planning_year
)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2026-TEST',
  'ETX 2026 test cycle',
  2026
);

insert into public.plan_versions (
  id,
  planning_cycle_id,
  version_number,
  status
)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    1,
    'draft'
  ),
  (
    '41000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    2,
    'approved'
  );

insert into public.plan_lines (
  id,
  plan_version_id,
  product_id,
  opening_stock,
  target_stock
)
values (
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000150',
  32,
  0
);

insert into public.purchase_batches (
  id,
  plan_version_id,
  batch_number,
  name,
  order_date,
  eta_date,
  status,
  currency_code
)
values (
  '43000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  1,
  'PO test',
  '2026-08-01',
  '2026-09-01',
  'planned',
  'EUR'
);

insert into public.purchase_lines (
  purchase_batch_id,
  product_id,
  qty,
  foc_qty,
  ex_price
)
values (
  '43000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000150',
  10,
  2,
  12.5
);

select is(
  (
    select amount
    from public.purchase_lines
    where purchase_batch_id = '43000000-0000-0000-0000-000000000001'
  ),
  125.00::numeric,
  'Amount always equals Qty multiplied by Ex Price and excludes FOC'
);

select throws_ok(
  $$
    update public.plan_versions
    set version_number = 99
    where id = '41000000-0000-0000-0000-000000000002'
  $$,
  'P0001',
  'approved_plan_is_immutable',
  'approved version cannot be changed directly'
);

select throws_ok(
  $$
    update public.plan_versions
    set status = 'submitted'
    where id = '41000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'plan_status_transition_requires_rpc',
  'direct status transition is rejected'
);

select * from finish();

rollback;
