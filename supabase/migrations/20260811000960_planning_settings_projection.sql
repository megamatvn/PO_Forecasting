create or replace view public.plan_projection_view
with (security_invoker = true, security_barrier = true)
as
with receipt_by_month as (
  select
    purchase_batches.plan_version_id,
    purchase_lines.product_id,
    date_trunc('month', purchase_batches.eta_date)::date as projection_month,
    sum(purchase_lines.qty + purchase_lines.foc_qty)::bigint as receipt_qty
  from public.purchase_batches
  join public.purchase_lines
    on purchase_lines.purchase_batch_id = purchase_batches.id
  where purchase_batches.status <> 'cancelled'
  group by
    purchase_batches.plan_version_id,
    purchase_lines.product_id,
    date_trunc('month', purchase_batches.eta_date)::date
),
projection_months as (
  select
    plan_monthly_demand.plan_line_id,
    plan_monthly_demand.demand_month as projection_month
  from public.plan_monthly_demand

  union

  select
    plan_lines.id as plan_line_id,
    receipt_by_month.projection_month
  from public.plan_lines
  join receipt_by_month
    on receipt_by_month.plan_version_id = plan_lines.plan_version_id
   and receipt_by_month.product_id = plan_lines.product_id
),
line_targets as (
  select
    plan_lines.id as plan_line_id,
    case
      when plan_lines.target_stock > 0 then plan_lines.target_stock
      else coalesce(planning_settings.safety_stock, 0)
        + ceil(
            coalesce(avg(plan_monthly_demand.demand_qty), 0)
            * coalesce(planning_settings.target_cover_months, 0)
          )::integer
    end::bigint as target_stock
  from public.plan_lines
  join public.plan_versions
    on plan_versions.id = plan_lines.plan_version_id
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
  left join public.planning_settings
    on planning_settings.brand_id = planning_cycles.brand_id
  left join public.plan_monthly_demand
    on plan_monthly_demand.plan_line_id = plan_lines.id
  group by
    plan_lines.id,
    plan_lines.target_stock,
    planning_settings.safety_stock,
    planning_settings.target_cover_months
),
monthly_activity as (
  select
    planning_cycles.brand_id,
    plan_versions.id as plan_version_id,
    plan_lines.id as plan_line_id,
    plan_lines.product_id,
    projection_months.projection_month,
    plan_lines.opening_stock::bigint as initial_stock,
    line_targets.target_stock,
    coalesce(plan_monthly_demand.demand_qty, 0)::bigint as demand_qty,
    coalesce(receipt_by_month.receipt_qty, 0)::bigint as receipt_qty
  from projection_months
  join public.plan_lines
    on plan_lines.id = projection_months.plan_line_id
  join public.plan_versions
    on plan_versions.id = plan_lines.plan_version_id
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
  join line_targets
    on line_targets.plan_line_id = plan_lines.id
  left join public.plan_monthly_demand
    on plan_monthly_demand.plan_line_id = plan_lines.id
   and plan_monthly_demand.demand_month = projection_months.projection_month
  left join receipt_by_month
    on receipt_by_month.plan_version_id = plan_versions.id
   and receipt_by_month.product_id = plan_lines.product_id
   and receipt_by_month.projection_month = projection_months.projection_month
),
running_projection as (
  select
    brand_id,
    plan_version_id,
    plan_line_id,
    product_id,
    projection_month,
    initial_stock,
    target_stock,
    demand_qty,
    receipt_qty,
    initial_stock
      + coalesce(
          sum(receipt_qty - demand_qty) over (
            partition by plan_line_id
            order by projection_month
            rows between unbounded preceding and current row
          ),
          0
        ) as closing_stock
  from monthly_activity
)
select
  brand_id,
  plan_version_id,
  plan_line_id,
  product_id,
  projection_month,
  initial_stock
    + coalesce(
        lag(closing_stock - initial_stock) over (
          partition by plan_line_id
          order by projection_month
        ),
        0
      ) as opening_stock,
  demand_qty,
  receipt_qty,
  closing_stock,
  target_stock,
  greatest(0, target_stock - closing_stock) as shortage_qty,
  case
    when closing_stock < 0 then 'critical'
    when closing_stock < target_stock then 'warning'
    else 'healthy'
  end as stock_status
from running_projection;

comment on view public.plan_projection_view is
  'RLS-respecting monthly projection; uses line Target Stock or brand safety stock plus target-cover demand, excludes cancelled PO and includes FOC as receipt.';
