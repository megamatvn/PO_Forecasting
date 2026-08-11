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
  target_plan public.plan_versions%rowtype;
  target_brand_id uuid;
  request_id uuid;
  existing_request public.approval_requests%rowtype;
  allowed_flags jsonb;
  merged_exception_flags jsonb;
  filtered_exception_flags jsonb;
  canonical_request jsonb;
  normalized_flags jsonb := coalesce(p_exception_flags, '{}'::jsonb);
begin
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'approval_idempotency_key_required';
  end if;

  if jsonb_typeof(normalized_flags) <> 'object' then
    raise exception using errcode = 'P0001', message = 'approval_exception_flags_must_be_object';
  end if;

  select * into target_plan
  from public.plan_versions
  where id = p_plan_version_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'plan_version_not_found';
  end if;

  select planning_cycles.brand_id
  into target_brand_id
  from public.planning_cycles
  where planning_cycles.id = target_plan.planning_cycle_id;

  if target_brand_id is null then
    raise exception using errcode = 'P0001', message = 'plan_version_not_found';
  end if;

  -- Authorization is evaluated before replay lookup. A reused key is not a
  -- way for a viewer or an out-of-scope planner to probe an approval request.
  if (select auth.uid()) is not null then
    if not public.can_plan_brand(target_brand_id) then
      raise exception using errcode = '42501', message = 'plan_submit_forbidden';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'plan_submit_forbidden';
  end if;

  canonical_request := jsonb_build_object(
    'planVersionId', p_plan_version_id,
    'exceptionFlags', normalized_flags
  );

  perform public.lock_action_idempotency_key(p_idempotency_key);

  select * into existing_request
  from public.approval_requests
  where submit_idempotency_key = p_idempotency_key;

  if found then
    if existing_request.plan_version_id <> p_plan_version_id
      or existing_request.submit_request <> canonical_request then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_request.id;
  end if;

  if target_plan.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'only_draft_can_be_submitted';
  end if;

  select approval_policies.escalation_flags
  into allowed_flags
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

  if allowed_flags is null then
    select escalation_flags
    into allowed_flags
    from public.approval_policies
    where is_default and is_active
    order by version desc
    limit 1;
  end if;

  merged_exception_flags := normalized_flags
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

  update public.approval_requests
  set submit_request = canonical_request
  where id = request_id;

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
