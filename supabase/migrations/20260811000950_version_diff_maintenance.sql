create function public.plan_version_snapshot(p_plan_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with snapshot_values(path, value) as (
  select format('planLines.%s.openingStock', plan_lines.product_id),
         to_jsonb(plan_lines.opening_stock)
  from public.plan_lines
  where plan_lines.plan_version_id = p_plan_version_id
  union all
  select format('planLines.%s.targetStock', plan_lines.product_id),
         to_jsonb(plan_lines.target_stock)
  from public.plan_lines
  where plan_lines.plan_version_id = p_plan_version_id
  union all
  select format('planLines.%s.notes', plan_lines.product_id),
         to_jsonb(plan_lines.notes)
  from public.plan_lines
  where plan_lines.plan_version_id = p_plan_version_id
  union all
  select format(
           'monthlyDemand.%s.%s',
           plan_lines.product_id,
           to_char(plan_monthly_demand.demand_month, 'YYYY-MM')
         ),
         to_jsonb(plan_monthly_demand.demand_qty)
  from public.plan_monthly_demand
  join public.plan_lines on plan_lines.id = plan_monthly_demand.plan_line_id
  where plan_lines.plan_version_id = p_plan_version_id
  union all
  select format('purchaseBatches.%s.status', purchase_batches.batch_number),
         to_jsonb(purchase_batches.status::text)
  from public.purchase_batches
  where purchase_batches.plan_version_id = p_plan_version_id
  union all
  select format('purchaseBatches.%s.etaDate', purchase_batches.batch_number),
         to_jsonb(purchase_batches.eta_date)
  from public.purchase_batches
  where purchase_batches.plan_version_id = p_plan_version_id
  union all
  select format(
           'purchaseLines.%s.%s.qty',
           purchase_batches.batch_number,
           purchase_lines.product_id
         ),
         to_jsonb(purchase_lines.qty)
  from public.purchase_lines
  join public.purchase_batches
    on purchase_batches.id = purchase_lines.purchase_batch_id
  where purchase_batches.plan_version_id = p_plan_version_id
  union all
  select format(
           'purchaseLines.%s.%s.focQty',
           purchase_batches.batch_number,
           purchase_lines.product_id
         ),
         to_jsonb(purchase_lines.foc_qty)
  from public.purchase_lines
  join public.purchase_batches
    on purchase_batches.id = purchase_lines.purchase_batch_id
  where purchase_batches.plan_version_id = p_plan_version_id
  union all
  select format(
           'purchaseLines.%s.%s.exPrice',
           purchase_batches.batch_number,
           purchase_lines.product_id
         ),
         to_jsonb(purchase_lines.ex_price)
  from public.purchase_lines
  join public.purchase_batches
    on purchase_batches.id = purchase_lines.purchase_batch_id
  where purchase_batches.plan_version_id = p_plan_version_id
  union all
  select format(
           'purchaseLines.%s.%s.amount',
           purchase_batches.batch_number,
           purchase_lines.product_id
         ),
         to_jsonb(purchase_lines.amount)
  from public.purchase_lines
  join public.purchase_batches
    on purchase_batches.id = purchase_lines.purchase_batch_id
  where purchase_batches.plan_version_id = p_plan_version_id
)
select coalesce(jsonb_object_agg(path, value order by path), '{}'::jsonb)
from snapshot_values;
$$;

create function public.refresh_version_diff(p_to_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_version_id uuid;
  target_brand_id uuid;
  before_snapshot jsonb;
  after_snapshot jsonb;
  diff_payload jsonb;
begin
  select plan_versions.parent_version_id, planning_cycles.brand_id
  into parent_version_id, target_brand_id
  from public.plan_versions
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
  where plan_versions.id = p_to_version_id;

  if parent_version_id is null or target_brand_id is null then
    return;
  end if;

  before_snapshot := public.plan_version_snapshot(parent_version_id);
  after_snapshot := public.plan_version_snapshot(p_to_version_id);

  with changed_values as (
    select
      keys.path,
      before_snapshot -> keys.path as before_value,
      after_snapshot -> keys.path as after_value,
      before_snapshot ? keys.path as before_present,
      after_snapshot ? keys.path as after_present
    from jsonb_object_keys(before_snapshot || after_snapshot) as keys(path)
    where (before_snapshot -> keys.path) is distinct from (after_snapshot -> keys.path)
       or (before_snapshot ? keys.path) is distinct from (after_snapshot ? keys.path)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'path', path,
        'before', case when before_present then before_value else null end,
        'after', case when after_present then after_value else null end,
        'impact', case
          when not before_present then 'added'
          when not after_present then 'removed'
          when jsonb_typeof(before_value) = 'number'
            and jsonb_typeof(after_value) = 'number'
            and (after_value #>> '{}')::numeric > (before_value #>> '{}')::numeric
            then 'increase'
          when jsonb_typeof(before_value) = 'number'
            and jsonb_typeof(after_value) = 'number'
            and (after_value #>> '{}')::numeric < (before_value #>> '{}')::numeric
            then 'decrease'
          else 'changed'
        end
      )
      order by path
    ),
    '[]'::jsonb
  )
  into diff_payload
  from changed_values;

  insert into public.version_diffs (
    brand_id,
    from_version_id,
    to_version_id,
    diff_data,
    created_by
  )
  values (
    target_brand_id,
    parent_version_id,
    p_to_version_id,
    diff_payload,
    (select auth.uid())
  )
  on conflict (from_version_id, to_version_id)
  do update set
    brand_id = excluded.brand_id,
    diff_data = excluded.diff_data,
    created_by = excluded.created_by,
    created_at = now();
end;
$$;

create function public.refresh_plan_version_diff_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_version_id uuid;
begin
  if tg_table_name = 'plan_lines' then
    target_version_id := case when tg_op = 'DELETE' then old.plan_version_id else new.plan_version_id end;
  elsif tg_table_name = 'plan_monthly_demand' then
    select plan_lines.plan_version_id into target_version_id
    from public.plan_lines
    where plan_lines.id = case when tg_op = 'DELETE' then old.plan_line_id else new.plan_line_id end;
  elsif tg_table_name = 'purchase_batches' then
    target_version_id := case when tg_op = 'DELETE' then old.plan_version_id else new.plan_version_id end;
  elsif tg_table_name = 'purchase_lines' then
    select purchase_batches.plan_version_id into target_version_id
    from public.purchase_batches
    where purchase_batches.id = case when tg_op = 'DELETE' then old.purchase_batch_id else new.purchase_batch_id end;
  end if;

  if target_version_id is not null then
    perform public.refresh_version_diff(target_version_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger plan_lines_version_diff_refresh
after insert or update or delete on public.plan_lines
for each row execute function public.refresh_plan_version_diff_trigger();

create trigger plan_monthly_demand_version_diff_refresh
after insert or update or delete on public.plan_monthly_demand
for each row execute function public.refresh_plan_version_diff_trigger();

create trigger purchase_batches_version_diff_refresh
after insert or update or delete on public.purchase_batches
for each row execute function public.refresh_plan_version_diff_trigger();

create trigger purchase_lines_version_diff_refresh
after insert or update or delete on public.purchase_lines
for each row execute function public.refresh_plan_version_diff_trigger();

revoke all on function public.plan_version_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.refresh_version_diff(uuid) from public, anon, authenticated;
revoke all on function public.refresh_plan_version_diff_trigger() from public, anon, authenticated;

comment on table public.version_diffs is
  'Persisted, brand-scoped JSON diff between immutable parent and revision snapshots.';
