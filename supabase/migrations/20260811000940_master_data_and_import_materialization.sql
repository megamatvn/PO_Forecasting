create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, code)
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  currency_code text not null default 'EUR'
    check (currency_code = upper(currency_code) and length(currency_code) = 3),
  ex_price numeric(18, 6) not null check (ex_price >= 0),
  effective_from date not null,
  effective_to date,
  source_snapshot_id uuid references public.source_snapshots(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, effective_from, currency_code),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.planning_settings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  target_cover_months numeric(8, 2) not null default 0
    check (target_cover_months >= 0),
  recommendation_rule text not null default 'target_stock'
    check (recommendation_rule in ('target_stock', 'lead_time_cover', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id)
);

alter table public.purchase_batches
  add constraint purchase_batches_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id)
  on delete set null;

create index suppliers_brand_active_idx
  on public.suppliers (brand_id, is_active);
create index product_prices_product_effective_idx
  on public.product_prices (product_id, effective_from desc);
create index planning_settings_brand_idx
  on public.planning_settings (brand_id);

insert into public.planning_settings (brand_id)
select id from public.brands
on conflict (brand_id) do nothing;

alter table public.suppliers enable row level security;
alter table public.product_prices enable row level security;
alter table public.planning_settings enable row level security;

create policy suppliers_select_by_access
on public.suppliers
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy suppliers_manage_by_access
on public.suppliers
for all
to authenticated
using (public.can_administer_brand(brand_id))
with check (public.can_administer_brand(brand_id));

create policy product_prices_select_by_access
on public.product_prices
for select
to authenticated
using (public.can_access_product(product_id));

create policy product_prices_manage_by_access
on public.product_prices
for all
to authenticated
using (public.can_administer_product(product_id))
with check (public.can_administer_product(product_id));

create policy planning_settings_select_by_access
on public.planning_settings
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy planning_settings_manage_by_access
on public.planning_settings
for all
to authenticated
using (public.can_administer_brand(brand_id))
with check (public.can_administer_brand(brand_id));

revoke all on table public.suppliers from anon, authenticated;
revoke all on table public.product_prices from anon, authenticated;
revoke all on table public.planning_settings from anon, authenticated;
grant select, insert, update, delete on table public.suppliers to authenticated;
grant select, insert, update, delete on table public.product_prices to authenticated;
grant select, insert, update, delete on table public.planning_settings to authenticated;
grant all on table public.suppliers to service_role;
grant all on table public.product_prices to service_role;
grant all on table public.planning_settings to service_role;

create function public.materialize_import_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staged_record record;
  receipt jsonb;
  demand jsonb;
  effective_date date := new.created_at::date;
begin
  -- Keep the imported Ex Price in the effective-dated price history. The
  -- generated Amount on purchase_lines remains the only amount authority.
  for staged_record in
    select import_row.product_id, import_row.normalized_data
    from public.import_staging_rows import_row
    where import_row.import_batch_id = new.import_batch_id
      and import_row.product_id is not null
      and import_row.normalized_data ? 'exPrice'
  loop
    insert into public.product_prices (
      product_id,
      currency_code,
      ex_price,
      effective_from,
      source_snapshot_id
    )
    values (
      staged_record.product_id,
      'EUR',
      (staged_record.normalized_data ->> 'exPrice')::numeric,
      effective_date,
      new.id
    )
    on conflict (product_id, effective_from, currency_code)
    do update set
      ex_price = excluded.ex_price,
      source_snapshot_id = excluded.source_snapshot_id,
      updated_at = now();
  end loop;

  insert into public.suppliers (brand_id, code, name)
  select distinct
    new.brand_id,
    btrim(receipt.value ->> 'supplierCode'),
    coalesce(nullif(btrim(receipt.value ->> 'supplierName'), ''), btrim(receipt.value ->> 'supplierCode'))
  from public.import_staging_rows import_row
  cross join lateral jsonb_array_elements(
    coalesce(import_row.normalized_data -> 'purchaseReceipts', '[]'::jsonb)
  ) receipt
  where import_row.import_batch_id = new.import_batch_id
    and nullif(btrim(receipt.value ->> 'supplierCode'), '') is not null
  on conflict (brand_id, code) do update set
    name = excluded.name,
    updated_at = now();

  insert into public.sales_demand (
    source_snapshot_id,
    brand_id,
    product_id,
    demand_month,
    demand_qty
  )
  select
    new.id,
    new.brand_id,
    import_row.product_id,
    (demand.value ->> 'demandMonth')::date,
    (demand.value ->> 'demandQty')::integer
  from public.import_staging_rows import_row
  cross join lateral jsonb_array_elements(
    coalesce(import_row.normalized_data -> 'monthlyDemand', '[]'::jsonb)
  ) demand
  where import_row.import_batch_id = new.import_batch_id
    and import_row.product_id is not null
    and (demand.value ->> 'demandQty')::integer >= 0
  on conflict (source_snapshot_id, product_id, demand_month)
  do update set demand_qty = excluded.demand_qty;

  insert into public.purchased_receipts (
    source_snapshot_id,
    brand_id,
    product_id,
    source_reference,
    order_date,
    eta_date,
    qty,
    foc_qty,
    status
  )
  select
    new.id,
    new.brand_id,
    import_row.product_id,
    receipt.value ->> 'sourceReference',
    nullif(receipt.value ->> 'orderDate', '')::date,
    nullif(receipt.value ->> 'etaDate', '')::date,
    greatest(0, (receipt.value ->> 'qty')::integer),
    greatest(0, coalesce((receipt.value ->> 'focQty')::integer, 0)),
    coalesce((receipt.value ->> 'status')::public.purchase_batch_status, 'confirmed')
  from public.import_staging_rows import_row
  cross join lateral jsonb_array_elements(
    coalesce(import_row.normalized_data -> 'purchaseReceipts', '[]'::jsonb)
  ) receipt
  where import_row.import_batch_id = new.import_batch_id
    and import_row.product_id is not null
    and nullif(receipt.value ->> 'sourceReference', '') is not null
  on conflict (source_snapshot_id, product_id, source_reference)
  do update set
    order_date = excluded.order_date,
    eta_date = excluded.eta_date,
    qty = excluded.qty,
    foc_qty = excluded.foc_qty,
    status = excluded.status;

  -- A periodic import refreshes Draft working copies only. Submitted,
  -- Approved and Superseded versions remain immutable snapshots.
  update public.plan_lines line
  set opening_stock = inventory.stock_qty,
      updated_at = now()
  from public.inventory_snapshots inventory
  join public.plan_versions version on true
  join public.planning_cycles cycle on cycle.id = version.planning_cycle_id
  where inventory.source_snapshot_id = new.id
    and inventory.product_id = line.product_id
    and line.plan_version_id = version.id
    and version.status = 'draft'
    and cycle.brand_id = new.brand_id;

  insert into public.plan_monthly_demand (plan_line_id, demand_month, demand_qty)
  select
    line.id,
    demand.demand_month,
    demand.demand_qty
  from public.plan_versions version
  join public.planning_cycles cycle on cycle.id = version.planning_cycle_id
  join public.plan_lines line on line.plan_version_id = version.id
  join public.sales_demand demand
    on demand.source_snapshot_id = new.id
   and demand.product_id = line.product_id
  where version.status = 'draft'
    and cycle.brand_id = new.brand_id
  on conflict (plan_line_id, demand_month)
  do update set demand_qty = excluded.demand_qty, updated_at = now();

  return new;
end;
$$;

create trigger source_snapshot_materialize_import
after insert on public.source_snapshots
for each row execute function public.materialize_import_snapshot();

revoke all on function public.materialize_import_snapshot() from public, anon, authenticated;

comment on table public.suppliers is
  'Brand-scoped supplier master imported from source workbooks and maintained by administrators.';
comment on table public.product_prices is
  'Effective-dated Ex Price history; Amount is always generated from Qty × Ex Price.';
comment on table public.planning_settings is
  'Brand-scoped lead-time, safety-stock and recommendation defaults.';
comment on function public.materialize_import_snapshot() is
  'Materializes imported demand, receipts, prices and Draft-only planning refreshes atomically.';
