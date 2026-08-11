create function public.preview_plan_approval_route(
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
  filtered_exception_flags jsonb;
  required_levels smallint;
  routing_reason text;
  has_exception boolean;
begin
  if jsonb_typeof(p_exception_flags) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'approval_exception_flags_must_be_object';
  end if;

  select * into target_plan
  from public.plan_versions
  where id = p_plan_version_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'plan_version_not_found';
  end if;

  if target_plan.status <> 'draft' then
    raise exception using
      errcode = 'P0001',
      message = 'only_draft_can_be_submitted';
  end if;

  if (select auth.uid()) is not null then
    if not public.can_edit_plan_version(p_plan_version_id) then
      raise exception using
        errcode = '42501',
        message = 'plan_submit_forbidden';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'plan_submit_forbidden';
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
    and (
      approval_policy_brands.effective_to is null
      or current_date <= approval_policy_brands.effective_to
    )
    and approval_policies.is_active
    and current_date >= approval_policies.effective_from
    and (
      approval_policies.effective_to is null
      or current_date <= approval_policies.effective_to
    )
  order by approval_policy_brands.effective_from desc, approval_policies.version desc
  limit 1;

  if not found then
    select * into target_policy
    from public.approval_policies
    where is_default
      and is_active
      and current_date >= effective_from
      and (effective_to is null or current_date <= effective_to)
    order by version desc
    limit 1;
  end if;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'approval_policy_not_found';
  end if;

  if target_policy.currency_code <> target_currency then
    raise exception using
      errcode = 'P0001',
      message = 'approval_policy_currency_mismatch';
  end if;

  if coalesce(target_policy.escalation_flags, '[]'::jsonb) ? '*' then
    filtered_exception_flags := p_exception_flags;
  else
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into filtered_exception_flags
    from jsonb_each(p_exception_flags) entry
    where target_policy.escalation_flags ? entry.key;
  end if;

  select coalesce(sum(purchase_lines.amount), 0)::numeric(20, 2)
  into target_amount
  from public.purchase_batches
  join public.purchase_lines
    on purchase_lines.purchase_batch_id = purchase_batches.id
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

revoke all on function public.preview_plan_approval_route(uuid, jsonb)
from public, anon;
grant execute on function public.preview_plan_approval_route(uuid, jsonb)
to authenticated, service_role;

comment on function public.preview_plan_approval_route(uuid, jsonb) is
  'Returns the currently applicable route without mutating the plan; submit_plan independently re-evaluates and snapshots the same policy.';
