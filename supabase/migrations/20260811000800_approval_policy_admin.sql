alter table public.approval_policies
  add column escalation_flags jsonb not null default '["*"]'::jsonb
  check (jsonb_typeof(escalation_flags) = 'array');

create function public.create_approval_policy(
  p_name text,
  p_mode public.approval_mode,
  p_threshold_amount numeric,
  p_currency_code text,
  p_brand_ids uuid[],
  p_escalation_flags text[],
  p_effective_from date,
  p_effective_to date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy_id uuid;
  policy_version integer;
  target_brand_id uuid;
begin
  if (select auth.uid()) is not null then
    if not public.current_user_has_role('administrator'::public.app_role) then
      raise exception using
        errcode = '42501',
        message = 'approval_policy_admin_required';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'approval_policy_admin_required';
  end if;

  if btrim(coalesce(p_name, '')) = ''
    or coalesce(array_length(p_brand_ids, 1), 0) = 0
    or p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from)
    or (p_mode = 'fixed_two_level' and p_threshold_amount is not null)
    or (p_mode = 'threshold' and (p_threshold_amount is null or p_threshold_amount < 0))
    or p_currency_code !~ '^[A-Z]{3}$' then
    raise exception using
      errcode = 'P0001',
      message = 'approval_policy_invalid';
  end if;

  foreach target_brand_id in array p_brand_ids loop
    if not exists (select 1 from public.brands where id = target_brand_id) then
      raise exception using
        errcode = 'P0001',
        message = 'approval_policy_brand_not_found';
    end if;

    if (select auth.uid()) is not null
      and not public.can_administer_brand(target_brand_id) then
      raise exception using
        errcode = '42501',
        message = 'approval_policy_admin_required';
    end if;
  end loop;

  select coalesce(max(version), 0) + 1 into policy_version
  from public.approval_policies
  where name = btrim(p_name);

  insert into public.approval_policies (
    name,
    mode,
    threshold_amount,
    currency_code,
    version,
    effective_from,
    effective_to,
    escalation_flags,
    created_by
  )
  values (
    btrim(p_name),
    p_mode,
    p_threshold_amount,
    p_currency_code,
    policy_version,
    p_effective_from,
    p_effective_to,
    to_jsonb(coalesce(p_escalation_flags, array[]::text[])),
    (select auth.uid())
  )
  returning id into policy_id;

  foreach target_brand_id in array p_brand_ids loop
    update public.approval_policy_brands
    set is_active = false
    where brand_id = target_brand_id
      and is_active
      and daterange(
        effective_from,
        coalesce(effective_to, 'infinity'::date),
        '[]'
      ) && daterange(
        p_effective_from,
        coalesce(p_effective_to, 'infinity'::date),
        '[]'
      );

    insert into public.approval_policy_brands (
      policy_id,
      brand_id,
      effective_from,
      effective_to,
      is_active,
      created_by
    )
    values (
      policy_id,
      target_brand_id,
      p_effective_from,
      p_effective_to,
      true,
      (select auth.uid())
    );
  end loop;

  return policy_id;
end;
$$;

revoke all on function public.create_approval_policy(
  text, public.approval_mode, numeric, text, uuid[], text[], date, date
) from public, anon;
grant execute on function public.create_approval_policy(
  text, public.approval_mode, numeric, text, uuid[], text[], date, date
) to authenticated, service_role;

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
  filtered_exception_flags jsonb;
begin
  perform public.lock_action_idempotency_key(p_idempotency_key);

  select id into request_id
  from public.approval_requests
  where submit_idempotency_key = p_idempotency_key;

  if found then
    return request_id;
  end if;

  target_brand_id := public.plan_version_brand_id(p_plan_version_id);

  select approval_policies.escalation_flags into allowed_flags
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

  if allowed_flags is null then
    select escalation_flags into allowed_flags
    from public.approval_policies
    where is_default and is_active
    order by version desc
    limit 1;
  end if;

  if coalesce(allowed_flags, '[]'::jsonb) ? '*' then
    filtered_exception_flags := p_exception_flags;
  else
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into filtered_exception_flags
    from jsonb_each(p_exception_flags) entry
    where allowed_flags ? entry.key;
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

comment on column public.approval_policies.escalation_flags is
  'Exception keys allowed to force two-level routing; ["*"] preserves the legacy allow-all behavior.';
comment on function public.create_approval_policy(
  text, public.approval_mode, numeric, text, uuid[], text[], date, date
) is
  'Atomically creates and assigns a versioned approval policy to one or many brands without changing in-flight request snapshots.';

