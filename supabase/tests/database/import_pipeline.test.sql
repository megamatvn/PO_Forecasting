begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table('public', 'import_batches', 'import batches exist');
select has_table('public', 'source_snapshots', 'source snapshots exist');
select is(
  (select public from storage.buckets where id = 'po-forecast-imports'),
  false,
  'Excel import bucket is private'
);

insert into public.import_batches (
  id,
  brand_id,
  file_name,
  file_size,
  checksum,
  status
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'error.xlsx',
    100,
    'checksum-error',
    'validated'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'warning.xlsx',
    100,
    'checksum-warning',
    'validated'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'clean.xlsx',
    100,
    'checksum-clean',
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
values
  (
    '50000000-0000-0000-0000-000000000001',
    7,
    'ET-UNKNOWN',
    'ET-UNKNOWN',
    null,
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    7,
    'ET-015027',
    'ET-015025',
    '20000000-0000-0000-0000-000000000025',
    '{}'::jsonb,
    '{"currentStock":100,"exPrice":"4.25"}'::jsonb
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    8,
    'ET-015150',
    'ET-015150',
    '20000000-0000-0000-0000-000000000150',
    '{}'::jsonb,
    '{"currentStock":32,"exPrice":"2.71"}'::jsonb
  );

insert into public.import_issues (
  import_batch_id,
  row_number,
  field,
  severity,
  code,
  message
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    7,
    'rawSku',
    'error',
    'unknown_sku',
    'Unknown SKU'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    7,
    'purchaseWaves.6.importedAmount',
    'warning',
    'formula_mismatch',
    'Amount mismatch'
  );

select throws_ok(
  $$
    select public.commit_import_batch(
      '50000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      false
    )
  $$,
  'P0001',
  'import_batch_has_errors',
  'an import error blocks the whole batch'
);

select throws_ok(
  $$
    select public.commit_import_batch(
      '50000000-0000-0000-0000-000000000002',
      '51000000-0000-0000-0000-000000000002',
      false
    )
  $$,
  'P0001',
  'import_warnings_require_confirmation',
  'warnings require explicit confirmation'
);

insert into public.planning_cycles (
  id,
  brand_id,
  code,
  name,
  planning_year
)
values (
  '40000000-0000-0000-0000-000000000050',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2050-IMPORT-TEST',
  'Submitted import protection test',
  2050
);

insert into public.plan_versions (
  id,
  planning_cycle_id,
  version_number,
  status
)
values (
  '41000000-0000-0000-0000-000000000050',
  '40000000-0000-0000-0000-000000000050',
  1,
  'submitted'
);

select lives_ok(
  $$
    select public.commit_import_batch(
      '50000000-0000-0000-0000-000000000003',
      '51000000-0000-0000-0000-000000000003',
      false
    )
  $$,
  'clean batch commits atomically'
);

select lives_ok(
  $$
    select public.commit_import_batch(
      '50000000-0000-0000-0000-000000000003',
      '51000000-0000-0000-0000-000000000003',
      false
    )
  $$,
  'retrying the same idempotency key is safe'
);

select is(
  (
    select count(*)
    from public.source_snapshots
    where import_batch_id = '50000000-0000-0000-0000-000000000003'
  ),
  1::bigint,
  'idempotent commit creates one source snapshot'
);

select is(
  (
    select source_snapshot_id
    from public.plan_versions
    where id = '41000000-0000-0000-0000-000000000050'
  ),
  null::uuid,
  'periodic import never overwrites a Submitted version'
);

select * from finish();

rollback;
