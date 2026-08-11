begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_view(
  'public',
  'plan_projection_view',
  'monthly plan projection view exists'
);

select ok(
  coalesce(
    (
      select 'security_invoker=true' = any(coalesce(reloptions, array[]::text[]))
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and pg_class.relname = 'plan_projection_view'
    ),
    false
  ),
  'projection view executes with caller RLS permissions'
);

select has_index(
  'public',
  'purchase_batches',
  'purchase_batches_projection_active_idx',
  'active receipt ETA lookup is indexed'
);

insert into public.planning_cycles (
  id,
  brand_id,
  code,
  name,
  planning_year
)
values (
  '40000000-0000-0000-0000-000000000060',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2060-PROJECTION-TEST',
  'ETX projection test',
  2060
);

insert into public.plan_versions (
  id,
  planning_cycle_id,
  version_number,
  status
)
values (
  '41000000-0000-0000-0000-000000000060',
  '40000000-0000-0000-0000-000000000060',
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
values
  (
    '42000000-0000-0000-0000-000000000060',
    '41000000-0000-0000-0000-000000000060',
    '20000000-0000-0000-0000-000000000150',
    32,
    0
  ),
  (
    '42000000-0000-0000-0000-000000000061',
    '41000000-0000-0000-0000-000000000060',
    '20000000-0000-0000-0000-000000000025',
    100,
    0
  );

insert into public.plan_monthly_demand (
  plan_line_id,
  demand_month,
  demand_qty
)
values
  ('42000000-0000-0000-0000-000000000060', '2060-01-01', 400),
  ('42000000-0000-0000-0000-000000000060', '2060-02-01', 400),
  ('42000000-0000-0000-0000-000000000060', '2060-03-01', 400),
  ('42000000-0000-0000-0000-000000000060', '2060-04-01', 600),
  ('42000000-0000-0000-0000-000000000060', '2060-05-01', 600),
  ('42000000-0000-0000-0000-000000000061', '2060-01-01', 30);

insert into public.purchase_batches (
  id,
  plan_version_id,
  batch_number,
  name,
  order_date,
  eta_date,
  status
)
values
  (
    '43000000-0000-0000-0000-000000000060',
    '41000000-0000-0000-0000-000000000060',
    1,
    'FOC receipt',
    '2059-12-01',
    '2060-01-01',
    'confirmed'
  ),
  (
    '43000000-0000-0000-0000-000000000061',
    '41000000-0000-0000-0000-000000000060',
    2,
    'Cancelled receipt',
    '2059-12-01',
    '2060-01-01',
    'cancelled'
  );

insert into public.purchase_lines (
  purchase_batch_id,
  product_id,
  qty,
  foc_qty,
  ex_price
)
values
  (
    '43000000-0000-0000-0000-000000000060',
    '20000000-0000-0000-0000-000000000025',
    0,
    10,
    4.25
  ),
  (
    '43000000-0000-0000-0000-000000000061',
    '20000000-0000-0000-0000-000000000025',
    100,
    10,
    4.25
  );

select results_eq(
  $$
    select closing_stock::bigint
    from public.plan_projection_view
    where plan_version_id = '41000000-0000-0000-0000-000000000060'
      and product_id = '20000000-0000-0000-0000-000000000150'
    order by projection_month desc
    limit 1
  $$,
  $$ values (-2368::bigint) $$,
  'ET-015150 final projected stock is -2,368'
);

select results_eq(
  $$
    select shortage_qty::bigint
    from public.plan_projection_view
    where plan_version_id = '41000000-0000-0000-0000-000000000060'
      and product_id = '20000000-0000-0000-0000-000000000150'
    order by projection_month desc
    limit 1
  $$,
  $$ values (2368::bigint) $$,
  'ET-015150 minimum purchase recommendation is 2,368'
);

select results_eq(
  $$
    select receipt_qty::bigint, closing_stock::bigint
    from public.plan_projection_view
    where plan_version_id = '41000000-0000-0000-0000-000000000060'
      and product_id = '20000000-0000-0000-0000-000000000025'
      and projection_month = '2060-01-01'
  $$,
  $$ values (10::bigint, 80::bigint) $$,
  'FOC adds stock while a cancelled PO contributes zero receipt'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000098',
  true
);

select results_eq(
  $$ select count(*) from public.plan_projection_view $$,
  $$ values (0::bigint) $$,
  'a user without brand access cannot read projection rows'
);

reset role;

select * from finish();

rollback;
