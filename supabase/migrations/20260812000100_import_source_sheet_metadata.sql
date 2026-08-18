alter table public.import_batches
  add column source_sheet_name text;

update public.import_batches
set source_sheet_name = 'Không xác định (legacy)'
where source_sheet_name is null;

alter table public.import_batches
  alter column source_sheet_name set not null,
  add constraint import_batches_source_sheet_name_not_blank
    check (btrim(source_sheet_name) <> '');

drop function public.stage_import_batch(
  uuid,
  text,
  bigint,
  text,
  text,
  jsonb,
  jsonb
);

create function public.stage_import_batch(
  p_brand_id uuid,
  p_file_name text,
  p_file_size bigint,
  p_storage_path text,
  p_checksum text,
  p_source_sheet_name text,
  p_rows jsonb,
  p_issues jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_id uuid;
  canonical_source_sheet_name text := btrim(p_source_sheet_name);
begin
  if canonical_source_sheet_name is null or canonical_source_sheet_name = '' then
    raise exception using
      errcode = '22023',
      message = 'import_source_sheet_name_required';
  end if;

  if (select auth.uid()) is not null then
    if not public.can_administer_brand(p_brand_id) then
      raise exception using
        errcode = '42501',
        message = 'import_batch_forbidden';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'import_batch_forbidden';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'import_batch_has_no_rows';
  end if;

  if jsonb_typeof(p_issues) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'import_issues_must_be_array';
  end if;

  select id into batch_id
  from public.import_batches
  where brand_id = p_brand_id
    and checksum = p_checksum;

  if found then
    return batch_id;
  end if;

  insert into public.import_batches (
    brand_id,
    file_name,
    file_size,
    storage_path,
    checksum,
    source_sheet_name,
    status,
    has_warnings,
    created_by
  )
  values (
    p_brand_id,
    p_file_name,
    p_file_size,
    p_storage_path,
    p_checksum,
    canonical_source_sheet_name,
    'validated',
    exists (
      select 1
      from jsonb_array_elements(p_issues) issue
      where issue ->> 'severity' = 'warning'
    ),
    (select auth.uid())
  )
  returning id into batch_id;

  insert into public.import_staging_rows (
    import_batch_id,
    row_number,
    raw_sku,
    canonical_sku,
    product_id,
    raw_data,
    normalized_data
  )
  select
    batch_id,
    staged_row."rowNumber",
    btrim(staged_row."rawSku"),
    btrim(staged_row."canonicalSku"),
    (
      select product.id
      from public.products product
      where product.brand_id = p_brand_id
        and product.canonical_sku = btrim(staged_row."canonicalSku")
      limit 1
    ),
    staged_row.value,
    staged_row.value
  from (
    select
      value,
      (value ->> 'rowNumber')::integer as "rowNumber",
      coalesce(value ->> 'rawSku', '') as "rawSku",
      coalesce(value ->> 'canonicalSku', '') as "canonicalSku"
    from jsonb_array_elements(p_rows) value
  ) staged_row;

  insert into public.import_issues (
    import_batch_id,
    row_number,
    field,
    severity,
    code,
    message
  )
  select
    batch_id,
    (issue ->> 'rowNumber')::integer,
    issue ->> 'field',
    (issue ->> 'severity')::public.import_issue_severity,
    issue ->> 'code',
    issue ->> 'message'
  from jsonb_array_elements(p_issues) issue;

  return batch_id;
end;
$$;

revoke all on function public.stage_import_batch(
  uuid,
  text,
  bigint,
  text,
  text,
  text,
  jsonb,
  jsonb
) from public, anon;

grant execute on function public.stage_import_batch(
  uuid,
  text,
  bigint,
  text,
  text,
  text,
  jsonb,
  jsonb
) to authenticated, service_role;

comment on function public.stage_import_batch(
  uuid,
  text,
  bigint,
  text,
  text,
  text,
  jsonb,
  jsonb
) is
  'Atomically stages a validated Excel preview, canonical product links and all issues with the selected source sheet audit metadata.';
