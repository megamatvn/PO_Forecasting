create or replace function public.materialize_import_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_date date := new.created_at::date;
begin
  with price_rows as (
    select distinct on (import_rows.product_id)
      import_rows.product_id,
      (import_rows.normalized_data ->> 'exPrice')::numeric as ex_price
    from public.import_staging_rows import_rows
    where import_rows.import_batch_id = new.import_batch_id
      and import_rows.product_id is not null
      and import_rows.normalized_data ? 'exPrice'
    order by import_rows.product_id, import_rows.row_number desc
  )
  insert into public.product_prices (
    product_id,
    currency_code,
    ex_price,
    effective_from,
    source_snapshot_id
  )
  select product_rows.product_id, 'EUR', product_rows.ex_price, effective_date, new.id
  from price_rows product_rows
  on conflict (product_id, effective_from, currency_code)
  do update set
    ex_price = excluded.ex_price,
    source_snapshot_id = excluded.source_snapshot_id,
    updated_at = now();

  insert into public.suppliers (brand_id, code, name)
  select distinct
    new.brand_id,
    btrim(receipt.value ->> 'supplierCode'),
    coalesce(
      nullif(btrim(receipt.value ->> 'supplierName'), ''),
      btrim(receipt.value ->> 'supplierCode')
    )
  from public.import_staging_rows import_rows
  cross join lateral jsonb_array_elements(
    coalesce(import_rows.normalized_data -> 'purchaseReceipts', '[]'::jsonb)
  ) receipt
  where import_rows.import_batch_id = new.import_batch_id
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
    import_rows.product_id,
    (demand.value ->> 'demandMonth')::date,
    (demand.value ->> 'demandQty')::integer
  from public.import_staging_rows import_rows
  cross join lateral jsonb_array_elements(
    coalesce(import_rows.normalized_data -> 'monthlyDemand', '[]'::jsonb)
  ) demand
  where import_rows.import_batch_id = new.import_batch_id
    and import_rows.product_id is not null
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
    import_rows.product_id,
    receipt.value ->> 'sourceReference',
    nullif(receipt.value ->> 'orderDate', '')::date,
    nullif(receipt.value ->> 'etaDate', '')::date,
    greatest(0, (receipt.value ->> 'qty')::integer),
    greatest(0, coalesce((receipt.value ->> 'focQty')::integer, 0)),
    coalesce((receipt.value ->> 'status')::public.purchase_batch_status, 'confirmed')
  from public.import_staging_rows import_rows
  cross join lateral jsonb_array_elements(
    coalesce(import_rows.normalized_data -> 'purchaseReceipts', '[]'::jsonb)
  ) receipt
  where import_rows.import_batch_id = new.import_batch_id
    and import_rows.product_id is not null
    and nullif(receipt.value ->> 'sourceReference', '') is not null
  on conflict (source_snapshot_id, product_id, source_reference)
  do update set
    order_date = excluded.order_date,
    eta_date = excluded.eta_date,
    qty = excluded.qty,
    foc_qty = excluded.foc_qty,
    status = excluded.status;

  insert into public.plan_monthly_demand (plan_line_id, demand_month, demand_qty)
  select
    plan_lines.id,
    imported_demand.demand_month,
    imported_demand.demand_qty
  from public.plan_versions
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
   and planning_cycles.brand_id = new.brand_id
  join public.plan_lines
    on plan_lines.plan_version_id = plan_versions.id
  join public.sales_demand imported_demand
    on imported_demand.source_snapshot_id = new.id
   and imported_demand.product_id = plan_lines.product_id
  where plan_versions.status = 'draft'
  on conflict (plan_line_id, demand_month)
  do update set demand_qty = excluded.demand_qty, updated_at = now();

  return new;
end;
$$;

create function public.materialize_import_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.plan_lines
  set opening_stock = new.stock_qty,
      updated_at = now()
  from public.plan_versions
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
   and planning_cycles.brand_id = new.brand_id
  where plan_lines.plan_version_id = plan_versions.id
    and plan_versions.status = 'draft'
    and plan_lines.product_id = new.product_id;
  return new;
end;
$$;

create trigger inventory_snapshot_materialize_draft
after insert on public.inventory_snapshots
for each row execute function public.materialize_import_inventory();

revoke all on function public.materialize_import_inventory() from public, anon, authenticated;
