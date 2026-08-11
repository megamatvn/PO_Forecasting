begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'suppliers', 'supplier master exists');
select has_table('public', 'product_prices', 'effective product prices exist');
select has_table('public', 'planning_settings', 'brand planning settings exist');
select policies_are(
  'public',
  'planning_settings',
  array['planning_settings_select_by_access', 'planning_settings_manage_by_access'],
  'planning settings are brand-scoped by RLS'
);

insert into public.brands (id, code, name)
values (
  '10000000-0000-0000-0000-000000000096',
  'ETX-SETTINGS-DEFAULT',
  'Planning settings trigger test'
);

select is(
  (select count(*) from public.planning_settings where brand_id = '10000000-0000-0000-0000-000000000096'),
  1::bigint,
  'new brands receive default planning settings'
);

insert into public.import_batches (
  id, brand_id, file_name, file_size, checksum, status
)
values (
  '50000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'materialization.xlsx',
  100,
  'checksum-materialization',
  'validated'
);

insert into public.import_staging_rows (
  import_batch_id,
  row_number,
  raw_sku,
  canonical_sku,
  product_id,
  raw_data,
  normalized_data
)
values (
  '50000000-0000-0000-0000-000000000004',
  7,
  'ET-015150',
  'ET-015150',
  '20000000-0000-0000-0000-000000000150',
  '{}'::jsonb,
  jsonb_build_object(
    'exPrice', '3.14',
    'currentStock', 42,
    'monthlyDemand', jsonb_build_array(
      jsonb_build_object('demandMonth', '2026-01-01', 'demandQty', 100),
      jsonb_build_object('demandMonth', '2026-02-01', 'demandQty', 120)
    ),
    'purchaseReceipts', jsonb_build_array(
      jsonb_build_object(
        'sourceReference', 'NK-004',
        'supplierCode', 'COOPER',
        'supplierName', 'COOPER France',
        'orderDate', '2026-01-05',
        'etaDate', '2026-01-20',
        'qty', 50,
        'focQty', 5,
        'status', 'received'
      )
    )
  )
);

insert into public.planning_cycles (
  id, brand_id, code, name, planning_year
)
values (
  '40000000-0000-0000-0000-000000000084',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2084-MATERIALIZATION',
  'Import materialization test',
  2084
);

insert into public.plan_versions (
  id, planning_cycle_id, version_number, status
)
values (
  '41000000-0000-0000-0000-000000000084',
  '40000000-0000-0000-0000-000000000084',
  1,
  'draft'
);

insert into public.plan_lines (
  id, plan_version_id, product_id, opening_stock
)
values (
  '42000000-0000-0000-0000-000000000084',
  '41000000-0000-0000-0000-000000000084',
  '20000000-0000-0000-0000-000000000150',
  0
);

update public.planning_settings
set safety_stock = 5,
    target_cover_months = 1
where brand_id = '10000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    select public.commit_import_batch(
      '50000000-0000-0000-0000-000000000004',
      '51000000-0000-0000-0000-000000000004',
      false
    )
  $$,
  'a validated import materializes source data atomically'
);

select is(
  (select count(*) from public.suppliers where brand_id = '10000000-0000-0000-0000-000000000001' and code = 'COOPER'),
  1::bigint,
  'supplier master is upserted from purchased receipts'
);

select is(
  (select ex_price from public.product_prices where product_id = '20000000-0000-0000-0000-000000000150' and effective_from = current_date),
  3.14::numeric,
  'imported Ex Price is stored in effective product price history'
);

select is(
  (select count(*) from public.sales_demand where source_snapshot_id = (select id from public.source_snapshots where import_batch_id = '50000000-0000-0000-0000-000000000004')),
  2::bigint,
  'monthly forecast demand is materialized'
);

select is(
  (select qty + foc_qty from public.purchased_receipts where source_snapshot_id = (select id from public.source_snapshots where import_batch_id = '50000000-0000-0000-0000-000000000004')),
  55,
  'purchased receipts preserve Qty plus FOC separately'
);

select results_eq(
  $$
    select opening_stock, demand_qty
    from public.plan_lines
    join public.plan_monthly_demand on plan_monthly_demand.plan_line_id = plan_lines.id
    where plan_lines.id = '42000000-0000-0000-0000-000000000084'
    order by demand_month
  $$,
  $$ values (42, 100), (42, 120) $$,
  'Draft planning copies receive inventory and imported monthly demand'
);

select is(
  (
    select target_stock
    from public.plan_projection_view
    where plan_version_id = '41000000-0000-0000-0000-000000000084'
    order by projection_month
    limit 1
  ),
  115::bigint,
  'target cover settings add one average demand month to safety stock'
);

select * from finish();

rollback;
