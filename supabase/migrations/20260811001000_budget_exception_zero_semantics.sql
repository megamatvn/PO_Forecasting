create or replace function public.derive_plan_exception_flags(p_plan_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
select jsonb_strip_nulls(
  jsonb_build_object(
    'budgetOverrun', case
      when planning_cycles.target_purchase_amount > 0
       and (
         select coalesce(sum(purchase_lines.amount), 0)
         from public.purchase_batches
         join public.purchase_lines
           on purchase_lines.purchase_batch_id = purchase_batches.id
         where purchase_batches.plan_version_id = plan_versions.id
           and purchase_batches.status <> 'cancelled'
       ) > planning_cycles.target_purchase_amount then true
      else null
    end,
    'approvedAdjustment', case
      when parent_version.status = 'approved' then true
      else null
    end,
    'criticalShortage', case
      when exists (
        select 1 from public.plan_projection_view
        where plan_version_id = plan_versions.id
          and stock_status = 'critical'
      ) then true
      else null
    end,
    'priceOverride', case
      when exists (
        select 1
        from public.purchase_batches
        join public.purchase_lines
          on purchase_lines.purchase_batch_id = purchase_batches.id
        join lateral (
          select product_prices.ex_price
          from public.product_prices
          where product_prices.product_id = purchase_lines.product_id
            and product_prices.effective_from <= current_date
            and (product_prices.effective_to is null or product_prices.effective_to >= current_date)
          order by product_prices.effective_from desc
          limit 1
        ) current_price on true
        where purchase_batches.plan_version_id = plan_versions.id
          and purchase_batches.status <> 'cancelled'
          and current_price.ex_price <> purchase_lines.ex_price
      ) then true
      else null
    end
  )
)
from public.plan_versions
join public.planning_cycles on planning_cycles.id = plan_versions.planning_cycle_id
left join public.plan_versions parent_version on parent_version.id = plan_versions.parent_version_id
where plan_versions.id = p_plan_version_id;
$$;
