create function public.derive_plan_exception_flags(p_plan_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
select jsonb_strip_nulls(
  jsonb_build_object(
    'budgetOverrun', case
      when (
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
        select 1
        from public.plan_projection_view
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
            and (
              product_prices.effective_to is null
              or product_prices.effective_to >= current_date
            )
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
join public.planning_cycles
  on planning_cycles.id = plan_versions.planning_cycle_id
left join public.plan_versions parent_version
  on parent_version.id = plan_versions.parent_version_id
where plan_versions.id = p_plan_version_id;
$$;

revoke all on function public.derive_plan_exception_flags(uuid) from public, anon;
grant execute on function public.derive_plan_exception_flags(uuid) to authenticated, service_role;

create or replace function public.preview_plan_approval_route(
  p_plan_version_id uuid,
  p_exception_flags jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_plan public.plan_versions%rowtype;
  target_policy public.approval_policies%rowtype;
  target_brand_id uuid;
  target_currency text;
  target_amount numeric(20, 2);
  allowed_flags jsonb;
  filtered_exception_flags jsonb;
  merged_exception_flags jsonb;
  required_levels smallint;
  routing_reason text;
  has_exception boolean;
begin
  if jsonb_typeof(coalesce(p_exception_flags, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'P0001', message = 'approval_exception_flags_must_be_object';
  end if;

  select * into target_plan
  from public.plan_versions
  where id = p_plan_version_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'plan_version_not_found';
  end if;
  if target_plan.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'only_draft_can_be_submitted';
  end if;
  if (select auth.uid()) is not null then
    if not public.can_edit_plan_version(p_plan_version_id) then
      raise exception using errcode = '42501', message = 'plan_submit_forbidden';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'plan_submit_forbidden';
  end if;

  select planning_cycles.brand_id, planning_cycles.currency_code
  into target_brand_id, target_currency
  from public.planning_cycles
  where planning_cycles.id = target_plan.planning_cycle_id;

  select approval_policies.* into target_policy
  from public.approval_policy_brands
  join public.approval_policies
    on approval_policies.id = approval_policy_brands.policy_id
  where approval_policy_brands.brand_id = target_brand_id
    and approval_policy_brands.is_active
    and current_date >= approval_policy_brands.effective_from
    and (approval_policy_brands.effective_to is null or current_date <= approval_policy_brands.effective_to)
    and approval_policies.is_active
    and current_date >= approval_policies.effective_from
    and (approval_policies.effective_to is null or current_date <= approval_policies.effective_to)
  order by approval_policy_brands.effective_from desc, approval_policies.version desc
  limit 1;

  if not found then
    select * into target_policy
    from public.approval_policies
    where is_default and is_active
      and current_date >= effective_from
      and (effective_to is null or current_date <= effective_to)
    order by version desc
    limit 1;
  end if;
  if not found then
    raise exception using errcode = 'P0001', message = 'approval_policy_not_found';
  end if;
  if target_policy.currency_code <> target_currency then
    raise exception using errcode = 'P0001', message = 'approval_policy_currency_mismatch';
  end if;

  merged_exception_flags := coalesce(p_exception_flags, '{}'::jsonb)
    || coalesce(public.derive_plan_exception_flags(p_plan_version_id), '{}'::jsonb);
  allowed_flags := target_policy.escalation_flags;
  if coalesce(allowed_flags, '[]'::jsonb) ? '*' then
    filtered_exception_flags := merged_exception_flags;
  else
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into filtered_exception_flags
    from jsonb_each(merged_exception_flags) entry
    where allowed_flags ? entry.key
      or entry.key in ('budgetOverrun', 'priceOverride', 'approvedAdjustment');
  end if;

  select coalesce(sum(purchase_lines.amount), 0)::numeric(20, 2)
  into target_amount
  from public.purchase_batches
  join public.purchase_lines on purchase_lines.purchase_batch_id = purchase_batches.id
  where purchase_batches.plan_version_id = p_plan_version_id
    and purchase_batches.status <> 'cancelled';
  select coalesce(bool_or(value = 'true'::jsonb), false)
  into has_exception
  from jsonb_each(filtered_exception_flags);

  if target_policy.mode = 'fixed_two_level' then
    required_levels := 2;
    routing_reason := 'fixed';
  elsif has_exception then
    required_levels := 2;
    routing_reason := 'exception';
  elsif target_amount >= target_policy.threshold_amount then
    required_levels := 2;
    routing_reason := 'threshold_met';
  else
    required_levels := 1;
    routing_reason := 'under_threshold';
  end if;

  return jsonb_build_object(
    'levels', required_levels,
    'reason', routing_reason,
    'planAmount', target_amount,
    'currencyCode', target_currency,
    'exceptionFlags', filtered_exception_flags
  );
end;
$$;

create or replace function public.submit_plan(
  p_plan_version_id uuid,
  p_idempotency_key uuid,
  p_exception_flags jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
  target_brand_id uuid;
  allowed_flags jsonb;
  merged_exception_flags jsonb;
  filtered_exception_flags jsonb;
begin
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select id into request_id
  from public.approval_requests
  where submit_idempotency_key = p_idempotency_key;
  if found then return request_id; end if;

  target_brand_id := public.plan_version_brand_id(p_plan_version_id);
  select approval_policies.escalation_flags into allowed_flags
  from public.approval_policy_brands
  join public.approval_policies on approval_policies.id = approval_policy_brands.policy_id
  where approval_policy_brands.brand_id = target_brand_id
    and approval_policy_brands.is_active
    and current_date >= approval_policy_brands.effective_from
    and (approval_policy_brands.effective_to is null or current_date <= approval_policy_brands.effective_to)
    and approval_policies.is_active
    and current_date >= approval_policies.effective_from
    and (approval_policies.effective_to is null or current_date <= approval_policies.effective_to)
  order by approval_policy_brands.effective_from desc, approval_policies.version desc
  limit 1;
  if allowed_flags is null then
    select escalation_flags into allowed_flags
    from public.approval_policies
    where is_default and is_active
    order by version desc limit 1;
  end if;

  merged_exception_flags := coalesce(p_exception_flags, '{}'::jsonb)
    || coalesce(public.derive_plan_exception_flags(p_plan_version_id), '{}'::jsonb);
  if coalesce(allowed_flags, '[]'::jsonb) ? '*' then
    filtered_exception_flags := merged_exception_flags;
  else
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into filtered_exception_flags
    from jsonb_each(merged_exception_flags) entry
    where allowed_flags ? entry.key
      or entry.key in ('budgetOverrun', 'priceOverride', 'approvedAdjustment');
  end if;

  request_id := public.submit_plan_unlocked(
    p_plan_version_id,
    p_idempotency_key,
    filtered_exception_flags
  );
  perform public.write_audit_event(
    target_brand_id,
    'plan_submitted',
    'plan_version',
    p_plan_version_id,
    p_idempotency_key,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'review_l1', 'approvalRequestId', request_id),
    jsonb_build_object('exceptionFlags', filtered_exception_flags)
  );
  return request_id;
end;
$$;

comment on function public.derive_plan_exception_flags(uuid) is
  'Derives trusted budget, price, approved-adjustment and shortage exception flags on the server.';
