begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_column(
  'public',
  'import_batches',
  'source_sheet_name',
  'import batches retain the selected source sheet'
);

select col_not_null(
  'public',
  'import_batches',
  'source_sheet_name',
  'source sheet metadata is required for new batches'
);

select ok(
  not exists (
    select 1
    from public.import_batches
    where source_sheet_name is null
       or btrim(source_sheet_name) = ''
  ),
  'legacy batches are backfilled and source sheet metadata is never blank'
);

select has_function(
  'public',
  'stage_import_batch',
  array['uuid', 'text', 'bigint', 'text', 'text', 'text', 'jsonb', 'jsonb'],
  'atomic import staging RPC exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'po_forecast_imports_select_admin'
  ),
  'administrators can read brand-scoped import files'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'po_forecast_imports_insert_admin'
  ),
  'administrators can upload brand-scoped import files'
);

select throws_ok(
  $$
    select public.stage_import_batch(
      '10000000-0000-0000-0000-000000000001',
      'atomic-stage.xlsx',
      1024,
      '10000000-0000-0000-0000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/atomic-stage.xlsx',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '',
      '[{"rowNumber":7,"rawSku":"ET-015027","canonicalSku":"ET-015025","productName":"Đặc trị xanh","exPrice":"4.25","currentStock":100,"purchaseWaves":[]}]'::jsonb,
      '[{"rowNumber":7,"field":"purchaseWaves.6.importedAmount","severity":"warning","code":"formula_mismatch","message":"Amount mismatch"}]'::jsonb
    )
  $$,
  '22023',
  'import_source_sheet_name_required',
  'a blank source sheet is rejected'
);

select lives_ok(
  $$
    select public.stage_import_batch(
      '10000000-0000-0000-0000-000000000001',
      'atomic-stage.xlsx',
      1024,
      '10000000-0000-0000-0000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/atomic-stage.xlsx',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'Forecast 5M',
      '[{"rowNumber":7,"rawSku":"ET-015027","canonicalSku":"ET-015025","productName":"Đặc trị xanh","exPrice":"4.25","currentStock":100,"purchaseWaves":[]}]'::jsonb,
      '[{"rowNumber":7,"field":"purchaseWaves.6.importedAmount","severity":"warning","code":"formula_mismatch","message":"Amount mismatch"}]'::jsonb
    )
  $$,
  'staging a validated import is one database transaction'
);

select is(
  (
    select status
    from public.import_batches
    where checksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  'validated'::public.import_batch_status,
  'staged batch is ready for commit validation'
);

select is(
  (
    select source_sheet_name
    from public.import_batches
    where checksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  'Forecast 5M',
  'staged batch retains the selected source sheet'
);

select is(
  (
    select count(*)
    from public.import_staging_rows rows
    join public.import_batches batches on batches.id = rows.import_batch_id
    where batches.checksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      and rows.product_id = '20000000-0000-0000-0000-000000000025'
  ),
  1::bigint,
  'canonical SKU is resolved to the brand product during staging'
);

select is(
  (
    select count(*)
    from public.import_issues issues
    join public.import_batches batches on batches.id = issues.import_batch_id
    where batches.checksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      and issues.severity = 'warning'
  ),
  1::bigint,
  'preview issues are staged with the batch'
);

insert into auth.users (id)
values ('90000000-0000-0000-0000-000000000099');

update public.profiles
set display_name = 'Storage policy test admin'
where id = '90000000-0000-0000-0000-000000000099';

insert into public.user_roles (user_id, role)
values ('90000000-0000-0000-0000-000000000099', 'administrator');

insert into public.user_brand_access (user_id, brand_id)
values (
  '90000000-0000-0000-0000-000000000099',
  '10000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000099',
  true
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values (
      'po-forecast-imports',
      '10000000-0000-0000-0000-000000000001/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/storage-policy.xlsx'
    )
  $$,
  'brand administrator can upload under the seeded brand UUID path'
);

reset role;

select * from finish();

rollback;
