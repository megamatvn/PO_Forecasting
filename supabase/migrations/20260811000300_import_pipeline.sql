create type public.import_batch_status as enum (
  'staged',
  'validated',
  'committed',
  'rejected',
  'failed'
);

create type public.import_issue_severity as enum ('error', 'warning');

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  file_name text not null check (btrim(file_name) <> ''),
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  storage_path text,
  checksum text not null check (length(checksum) = 64 or checksum like 'checksum-%'),
  status public.import_batch_status not null default 'staged',
  has_warnings boolean not null default false,
  warnings_confirmed_at timestamptz,
  commit_idempotency_key uuid unique,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  unique (brand_id, checksum)
);

create table public.import_staging_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_sku text not null,
  canonical_sku text not null,
  product_id uuid references public.products(id),
  raw_data jsonb not null,
  normalized_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (import_batch_id, row_number)
);

create table public.import_issues (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  field text not null,
  severity public.import_issue_severity not null,
  code text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  import_batch_id uuid not null unique references public.import_batches(id),
  snapshot_data jsonb not null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sales_demand (
  id uuid primary key default gen_random_uuid(),
  source_snapshot_id uuid not null references public.source_snapshots(id) on delete cascade,
  brand_id uuid not null references public.brands(id),
  product_id uuid not null references public.products(id),
  demand_month date not null check (demand_month = date_trunc('month', demand_month)::date),
  demand_qty integer not null check (demand_qty >= 0),
  unique (source_snapshot_id, product_id, demand_month)
);

create table public.inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_snapshot_id uuid not null references public.source_snapshots(id) on delete cascade,
  brand_id uuid not null references public.brands(id),
  product_id uuid not null references public.products(id),
  snapshot_date date not null default current_date,
  stock_qty integer not null,
  unique (source_snapshot_id, product_id, snapshot_date)
);

create table public.purchased_receipts (
  id uuid primary key default gen_random_uuid(),
  source_snapshot_id uuid not null references public.source_snapshots(id) on delete cascade,
  brand_id uuid not null references public.brands(id),
  product_id uuid not null references public.products(id),
  source_reference text not null,
  order_date date,
  eta_date date,
  qty integer not null check (qty >= 0),
  foc_qty integer not null default 0 check (foc_qty >= 0),
  status public.purchase_batch_status not null default 'confirmed',
  unique (source_snapshot_id, product_id, source_reference)
);

create index import_batches_brand_status_idx
  on public.import_batches (brand_id, status, created_at desc);
create index import_staging_rows_batch_sku_idx
  on public.import_staging_rows (import_batch_id, canonical_sku);
create index import_issues_batch_severity_idx
  on public.import_issues (import_batch_id, severity);
create index source_snapshots_brand_created_idx
  on public.source_snapshots (brand_id, created_at desc);
create index sales_demand_brand_product_month_idx
  on public.sales_demand (brand_id, product_id, demand_month);
create index inventory_snapshots_brand_product_date_idx
  on public.inventory_snapshots (brand_id, product_id, snapshot_date desc);
create index purchased_receipts_brand_product_eta_idx
  on public.purchased_receipts (brand_id, product_id, eta_date);

alter table public.plan_versions
  add constraint plan_versions_source_snapshot_id_fkey
  foreign key (source_snapshot_id)
  references public.source_snapshots(id)
  on delete set null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'po-forecast-imports',
  'po-forecast-imports',
  false,
  26214400,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function public.can_access_import_batch(p_import_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.import_batches
    where id = p_import_batch_id
      and public.can_access_brand(brand_id)
  );
$$;

create function public.can_administer_import_batch(p_import_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.import_batches
    where id = p_import_batch_id
      and public.can_administer_brand(brand_id)
  );
$$;

revoke all on function public.can_access_import_batch(uuid) from public, anon;
revoke all on function public.can_administer_import_batch(uuid) from public, anon;
grant execute on function public.can_access_import_batch(uuid) to authenticated;
grant execute on function public.can_administer_import_batch(uuid) to authenticated;

create function public.commit_import_batch(
  p_batch_id uuid,
  p_idempotency_key uuid,
  p_warnings_confirmed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.import_batches%rowtype;
  snapshot_id uuid;
  snapshot_payload jsonb;
begin
  if p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'import_idempotency_key_required';
  end if;

  select * into target_batch
  from public.import_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'import_batch_not_found';
  end if;

  if (select auth.uid()) is not null then
    if not public.can_administer_brand(target_batch.brand_id) then
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

  if target_batch.status = 'committed' then
    if target_batch.commit_idempotency_key = p_idempotency_key then
      select id into snapshot_id
      from public.source_snapshots
      where import_batch_id = p_batch_id;

      return snapshot_id;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'import_batch_already_committed';
  end if;

  if target_batch.status <> 'validated' then
    raise exception using
      errcode = 'P0001',
      message = 'import_batch_not_validated';
  end if;

  if not exists (
    select 1
    from public.import_staging_rows
    where import_batch_id = p_batch_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'import_batch_has_no_rows';
  end if;

  if exists (
    select 1
    from public.import_issues
    where import_batch_id = p_batch_id
      and severity = 'error'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'import_batch_has_errors';
  end if;

  if exists (
    select 1
    from public.import_issues
    where import_batch_id = p_batch_id
      and severity = 'warning'
  ) and not p_warnings_confirmed then
    raise exception using
      errcode = 'P0001',
      message = 'import_warnings_require_confirmation';
  end if;

  select jsonb_build_object(
    'rows',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rowNumber', row_number,
          'rawSku', raw_sku,
          'canonicalSku', canonical_sku,
          'productId', product_id,
          'data', normalized_data
        )
        order by row_number
      ),
      '[]'::jsonb
    )
  ) into snapshot_payload
  from public.import_staging_rows
  where import_batch_id = p_batch_id;

  insert into public.source_snapshots (
    brand_id,
    import_batch_id,
    snapshot_data,
    created_by
  )
  values (
    target_batch.brand_id,
    p_batch_id,
    snapshot_payload,
    (select auth.uid())
  )
  returning id into snapshot_id;

  insert into public.inventory_snapshots (
    source_snapshot_id,
    brand_id,
    product_id,
    snapshot_date,
    stock_qty
  )
  select
    snapshot_id,
    target_batch.brand_id,
    product_id,
    current_date,
    (normalized_data ->> 'currentStock')::integer
  from public.import_staging_rows
  where import_batch_id = p_batch_id
    and product_id is not null
    and normalized_data ? 'currentStock';

  update public.plan_versions
  set source_snapshot_id = snapshot_id,
      lock_version = lock_version + 1
  where status = 'draft'
    and planning_cycle_id in (
      select id
      from public.planning_cycles
      where brand_id = target_batch.brand_id
    );

  update public.import_batches
  set status = 'committed',
      has_warnings = exists (
        select 1
        from public.import_issues
        where import_batch_id = p_batch_id
          and severity = 'warning'
      ),
      warnings_confirmed_at = case
        when p_warnings_confirmed then now()
        else null
      end,
      commit_idempotency_key = p_idempotency_key,
      committed_at = now()
  where id = p_batch_id;

  return snapshot_id;
end;
$$;

revoke all on function public.commit_import_batch(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.commit_import_batch(uuid, uuid, boolean)
  to authenticated, service_role;

alter table public.import_batches enable row level security;
alter table public.import_staging_rows enable row level security;
alter table public.import_issues enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.sales_demand enable row level security;
alter table public.inventory_snapshots enable row level security;
alter table public.purchased_receipts enable row level security;

create policy import_batches_select_by_access
on public.import_batches
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy import_batches_manage_admin
on public.import_batches
for all
to authenticated
using (public.can_administer_brand(brand_id))
with check (public.can_administer_brand(brand_id));

create policy import_staging_rows_select_by_access
on public.import_staging_rows
for select
to authenticated
using (public.can_access_import_batch(import_batch_id));

create policy import_staging_rows_manage_admin
on public.import_staging_rows
for all
to authenticated
using (public.can_administer_import_batch(import_batch_id))
with check (public.can_administer_import_batch(import_batch_id));

create policy import_issues_select_by_access
on public.import_issues
for select
to authenticated
using (public.can_access_import_batch(import_batch_id));

create policy import_issues_manage_admin
on public.import_issues
for all
to authenticated
using (public.can_administer_import_batch(import_batch_id))
with check (public.can_administer_import_batch(import_batch_id));

create policy source_snapshots_select_by_access
on public.source_snapshots
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy sales_demand_select_by_access
on public.sales_demand
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy inventory_snapshots_select_by_access
on public.inventory_snapshots
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy purchased_receipts_select_by_access
on public.purchased_receipts
for select
to authenticated
using (public.can_access_brand(brand_id));

revoke all on table public.import_batches from anon, authenticated;
revoke all on table public.import_staging_rows from anon, authenticated;
revoke all on table public.import_issues from anon, authenticated;
revoke all on table public.source_snapshots from anon, authenticated;
revoke all on table public.sales_demand from anon, authenticated;
revoke all on table public.inventory_snapshots from anon, authenticated;
revoke all on table public.purchased_receipts from anon, authenticated;

grant select, insert, update, delete on table public.import_batches to authenticated;
grant select, insert, update, delete on table public.import_staging_rows to authenticated;
grant select, insert, update, delete on table public.import_issues to authenticated;
grant select on table public.source_snapshots to authenticated;
grant select on table public.sales_demand to authenticated;
grant select on table public.inventory_snapshots to authenticated;
grant select on table public.purchased_receipts to authenticated;

grant all on table public.import_batches to service_role;
grant all on table public.import_staging_rows to service_role;
grant all on table public.import_issues to service_role;
grant all on table public.source_snapshots to service_role;
grant all on table public.sales_demand to service_role;
grant all on table public.inventory_snapshots to service_role;
grant all on table public.purchased_receipts to service_role;

grant usage on type public.import_batch_status to authenticated, service_role;
grant usage on type public.import_issue_severity to authenticated, service_role;

comment on function public.commit_import_batch(uuid, uuid, boolean) is
  'Atomically commits one validated import batch, creates one source snapshot and refreshes Draft plans only.';
