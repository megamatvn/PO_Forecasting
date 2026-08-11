alter table public.approval_requests
  add column submit_request jsonb not null default '{}'::jsonb;

alter table public.approval_requests
  add constraint approval_requests_submit_request_object
  check (jsonb_typeof(submit_request) = 'object');

update public.approval_requests
set submit_request = jsonb_build_object(
  'planVersionId', plan_version_id,
  'exceptionFlags', exception_flags
)
where submit_request = '{}'::jsonb;

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

  -- Authorize the target before looking up an idempotency replay. A caller
  -- must already be an active planner/admin for the target brand; possession
  -- of a previously used key must never become an authorization oracle.
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

  request_id := public.submit_plan_unlocked(
    p_plan_version_id,
    p_idempotency_key,
    normalized_flags
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
    jsonb_build_object('exceptionFlags', normalized_flags)
  );

  return request_id;
end;
$$;

comment on column public.approval_requests.submit_request is
  'Canonical plan version and client exception payload bound to the Submit idempotency key.';
