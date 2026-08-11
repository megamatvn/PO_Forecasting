create table public.action_idempotency (
  idempotency_key uuid primary key,
  action_type text not null check (btrim(action_type) <> ''),
  resource_id uuid not null,
  result jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  actor_id uuid references auth.users(id),
  event_type text not null check (btrim(event_type) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid not null,
  idempotency_key uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create table public.version_diffs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  from_version_id uuid not null references public.plan_versions(id),
  to_version_id uuid not null references public.plan_versions(id),
  diff_data jsonb not null default '[]'::jsonb
    check (jsonb_typeof(diff_data) = 'array'),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (from_version_id, to_version_id),
  check (from_version_id <> to_version_id)
);

create index audit_events_brand_occurred_idx
  on public.audit_events (brand_id, occurred_at desc);
create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, occurred_at desc);
create index audit_events_idempotency_idx
  on public.audit_events (idempotency_key)
  where idempotency_key is not null;
create index version_diffs_brand_created_idx
  on public.version_diffs (brand_id, created_at desc);
create index version_diffs_to_version_idx
  on public.version_diffs (to_version_id);

create function public.guard_audit_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'audit_events_append_only';
end;
$$;

create trigger audit_events_append_only_guard
before update or delete on public.audit_events
for each row execute function public.guard_audit_events_append_only();

create function public.lock_action_idempotency_key(p_idempotency_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'action_idempotency_key_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );
end;
$$;

create function public.write_audit_event(
  p_brand_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_idempotency_key uuid,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  insert into public.audit_events (
    brand_id,
    actor_id,
    event_type,
    entity_type,
    entity_id,
    idempotency_key,
    before_data,
    after_data,
    metadata
  )
  values (
    p_brand_id,
    (select auth.uid()),
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_idempotency_key,
    p_before_data,
    p_after_data,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into event_id;

  return event_id;
end;
$$;

create function public.create_plan_revision(
  p_source_plan_version_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_plan public.plan_versions%rowtype;
  source_line public.plan_lines%rowtype;
  source_batch public.purchase_batches%rowtype;
  existing_action public.action_idempotency%rowtype;
  target_brand_id uuid;
  revision_id uuid;
  revision_line_id uuid;
  revision_batch_id uuid;
  next_version_number integer;
begin
  perform public.lock_action_idempotency_key(p_idempotency_key);

  select * into existing_action
  from public.action_idempotency
  where idempotency_key = p_idempotency_key;

  if found then
    if existing_action.action_type <> 'create_plan_revision'
      or existing_action.resource_id <> p_source_plan_version_id then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_key_reused';
    end if;

    return (existing_action.result ->> 'revisionId')::uuid;
  end if;

  select * into source_plan
  from public.plan_versions
  where id = p_source_plan_version_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'plan_version_not_found';
  end if;

  if source_plan.status not in ('approved', 'changes_requested') then
    raise exception using
      errcode = 'P0001',
      message = 'revision_source_must_be_approved_or_changes_requested';
  end if;

  select planning_cycles.brand_id into target_brand_id
  from public.planning_cycles
  where planning_cycles.id = source_plan.planning_cycle_id;

  if (select auth.uid()) is not null then
    if not public.can_plan_brand(target_brand_id) then
      raise exception using
        errcode = '42501',
        message = 'create_revision_forbidden';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'create_revision_forbidden';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(source_plan.planning_cycle_id::text, 1)
  );

  select coalesce(max(version_number), 0) + 1
  into next_version_number
  from public.plan_versions
  where planning_cycle_id = source_plan.planning_cycle_id;

  insert into public.plan_versions (
    planning_cycle_id,
    version_number,
    parent_version_id,
    source_snapshot_id,
    status,
    lock_version,
    created_by
  )
  values (
    source_plan.planning_cycle_id,
    next_version_number,
    source_plan.id,
    source_plan.source_snapshot_id,
    'draft',
    0,
    (select auth.uid())
  )
  returning id into revision_id;

  for source_line in
    select *
    from public.plan_lines
    where plan_version_id = source_plan.id
    order by id
  loop
    insert into public.plan_lines (
      plan_version_id,
      product_id,
      opening_stock,
      target_stock,
      notes
    )
    values (
      revision_id,
      source_line.product_id,
      source_line.opening_stock,
      source_line.target_stock,
      source_line.notes
    )
    returning id into revision_line_id;

    insert into public.plan_monthly_demand (
      plan_line_id,
      demand_month,
      demand_qty
    )
    select
      revision_line_id,
      demand_month,
      demand_qty
    from public.plan_monthly_demand
    where plan_line_id = source_line.id;
  end loop;

  for source_batch in
    select *
    from public.purchase_batches
    where plan_version_id = source_plan.id
    order by batch_number
  loop
    insert into public.purchase_batches (
      plan_version_id,
      batch_number,
      name,
      order_date,
      eta_date,
      status,
      currency_code,
      supplier_id
    )
    values (
      revision_id,
      source_batch.batch_number,
      source_batch.name,
      source_batch.order_date,
      source_batch.eta_date,
      source_batch.status,
      source_batch.currency_code,
      source_batch.supplier_id
    )
    returning id into revision_batch_id;

    insert into public.purchase_lines (
      purchase_batch_id,
      product_id,
      qty,
      foc_qty,
      ex_price
    )
    select
      revision_batch_id,
      product_id,
      qty,
      foc_qty,
      ex_price
    from public.purchase_lines
    where purchase_batch_id = source_batch.id;
  end loop;

  insert into public.action_idempotency (
    idempotency_key,
    action_type,
    resource_id,
    result,
    created_by
  )
  values (
    p_idempotency_key,
    'create_plan_revision',
    p_source_plan_version_id,
    jsonb_build_object('revisionId', revision_id),
    (select auth.uid())
  );

  perform public.write_audit_event(
    target_brand_id,
    'plan_revision_created',
    'plan_version',
    revision_id,
    p_idempotency_key,
    jsonb_build_object(
      'sourceVersionId', source_plan.id,
      'sourceStatus', source_plan.status,
      'versionNumber', source_plan.version_number
    ),
    jsonb_build_object(
      'revisionId', revision_id,
      'status', 'draft',
      'versionNumber', next_version_number
    ),
    jsonb_build_object('parentVersionId', source_plan.id)
  );

  return revision_id;
end;
$$;

create function public.save_draft_changes(
  p_plan_version_id uuid,
  p_expected_lock_version integer,
  p_changes jsonb,
  p_idempotency_key uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_action public.action_idempotency%rowtype;
  target_brand_id uuid;
  new_lock_version integer;
  change_item jsonb;
  affected_rows integer;
begin
  perform public.lock_action_idempotency_key(p_idempotency_key);

  select * into existing_action
  from public.action_idempotency
  where idempotency_key = p_idempotency_key;

  if found then
    if existing_action.action_type <> 'save_draft_changes'
      or existing_action.resource_id <> p_plan_version_id then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_key_reused';
    end if;

    return (existing_action.result ->> 'lockVersion')::integer;
  end if;

  if jsonb_typeof(p_changes) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'draft_changes_must_be_object';
  end if;

  if (p_changes ? 'planLines' and jsonb_typeof(p_changes -> 'planLines') <> 'array')
    or (p_changes ? 'monthlyDemand' and jsonb_typeof(p_changes -> 'monthlyDemand') <> 'array')
    or (p_changes ? 'purchaseBatches' and jsonb_typeof(p_changes -> 'purchaseBatches') <> 'array')
    or (p_changes ? 'purchaseLines' and jsonb_typeof(p_changes -> 'purchaseLines') <> 'array') then
    raise exception using
      errcode = 'P0001',
      message = 'draft_change_collections_must_be_arrays';
  end if;

  select planning_cycles.brand_id into target_brand_id
  from public.plan_versions
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
  where plan_versions.id = p_plan_version_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'plan_version_not_found';
  end if;

  if (select auth.uid()) is not null then
    if not public.can_edit_plan_version(p_plan_version_id) then
      raise exception using
        errcode = '42501',
        message = 'save_draft_forbidden';
    end if;
  elsif session_user <> 'postgres'
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'save_draft_forbidden';
  end if;

  update public.plan_versions
  set lock_version = lock_version + 1
  where id = p_plan_version_id
    and status = 'draft'
    and lock_version = p_expected_lock_version
  returning lock_version into new_lock_version;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_VERSION_CONFLICT';
  end if;

  for change_item in
    select value
    from jsonb_array_elements(coalesce(p_changes -> 'planLines', '[]'::jsonb))
  loop
    update public.plan_lines
    set opening_stock = case
          when change_item ? 'openingStock'
            then (change_item ->> 'openingStock')::integer
          else opening_stock
        end,
        target_stock = case
          when change_item ? 'targetStock'
            then (change_item ->> 'targetStock')::integer
          else target_stock
        end,
        notes = case
          when change_item ? 'notes' then change_item ->> 'notes'
          else notes
        end,
        updated_at = now()
    where id = (change_item ->> 'id')::uuid
      and plan_version_id = p_plan_version_id;

    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'draft_change_target_not_found';
    end if;
  end loop;

  for change_item in
    select value
    from jsonb_array_elements(coalesce(p_changes -> 'monthlyDemand', '[]'::jsonb))
  loop
    update public.plan_monthly_demand demand
    set demand_qty = case
          when change_item ? 'demandQty'
            then (change_item ->> 'demandQty')::integer
          else demand.demand_qty
        end,
        updated_at = now()
    where demand.id = (change_item ->> 'id')::uuid
      and exists (
        select 1
        from public.plan_lines
        where plan_lines.id = demand.plan_line_id
          and plan_lines.plan_version_id = p_plan_version_id
      );

    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'draft_change_target_not_found';
    end if;
  end loop;

  for change_item in
    select value
    from jsonb_array_elements(coalesce(p_changes -> 'purchaseBatches', '[]'::jsonb))
  loop
    update public.purchase_batches
    set name = case
          when change_item ? 'name' then change_item ->> 'name'
          else name
        end,
        order_date = case
          when change_item ? 'orderDate'
            then (change_item ->> 'orderDate')::date
          else order_date
        end,
        eta_date = case
          when change_item ? 'etaDate'
            then (change_item ->> 'etaDate')::date
          else eta_date
        end,
        status = case
          when change_item ? 'status'
            then (change_item ->> 'status')::public.purchase_batch_status
          else status
        end,
        updated_at = now()
    where id = (change_item ->> 'id')::uuid
      and plan_version_id = p_plan_version_id;

    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'draft_change_target_not_found';
    end if;
  end loop;

  for change_item in
    select value
    from jsonb_array_elements(coalesce(p_changes -> 'purchaseLines', '[]'::jsonb))
  loop
    update public.purchase_lines purchase_line
    set qty = case
          when change_item ? 'qty' then (change_item ->> 'qty')::integer
          else purchase_line.qty
        end,
        foc_qty = case
          when change_item ? 'focQty' then (change_item ->> 'focQty')::integer
          else purchase_line.foc_qty
        end,
        ex_price = case
          when change_item ? 'exPrice' then (change_item ->> 'exPrice')::numeric
          else purchase_line.ex_price
        end,
        updated_at = now()
    where purchase_line.id = (change_item ->> 'id')::uuid
      and exists (
        select 1
        from public.purchase_batches
        where purchase_batches.id = purchase_line.purchase_batch_id
          and purchase_batches.plan_version_id = p_plan_version_id
      );

    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'draft_change_target_not_found';
    end if;
  end loop;

  insert into public.action_idempotency (
    idempotency_key,
    action_type,
    resource_id,
    result,
    created_by
  )
  values (
    p_idempotency_key,
    'save_draft_changes',
    p_plan_version_id,
    jsonb_build_object('lockVersion', new_lock_version),
    (select auth.uid())
  );

  perform public.write_audit_event(
    target_brand_id,
    'draft_saved',
    'plan_version',
    p_plan_version_id,
    p_idempotency_key,
    jsonb_build_object('lockVersion', p_expected_lock_version),
    jsonb_build_object('lockVersion', new_lock_version),
    jsonb_build_object('changes', p_changes)
  );

  return new_lock_version;
end;
$$;

alter function public.commit_import_batch(uuid, uuid, boolean)
  rename to commit_import_batch_unlocked;

revoke all on function public.commit_import_batch_unlocked(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

create function public.commit_import_batch(
  p_batch_id uuid,
  p_idempotency_key uuid,
  p_warnings_confirmed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_id uuid;
  target_brand_id uuid;
  already_audited boolean;
begin
  perform public.lock_action_idempotency_key(p_idempotency_key);

  select exists (
    select 1
    from public.audit_events
    where event_type = 'import_committed'
      and idempotency_key = p_idempotency_key
  ) into already_audited;

  snapshot_id := public.commit_import_batch_unlocked(
    p_batch_id,
    p_idempotency_key,
    p_warnings_confirmed
  );

  if not already_audited then
    select brand_id into target_brand_id
    from public.import_batches
    where id = p_batch_id;

    perform public.write_audit_event(
      target_brand_id,
      'import_committed',
      'import_batch',
      p_batch_id,
      p_idempotency_key,
      null,
      jsonb_build_object('snapshotId', snapshot_id),
      jsonb_build_object('warningsConfirmed', p_warnings_confirmed)
    );
  end if;

  return snapshot_id;
end;
$$;

alter function public.submit_plan(uuid, uuid, jsonb)
  rename to submit_plan_unlocked;

revoke all on function public.submit_plan_unlocked(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.submit_plan(
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
begin
  perform public.lock_action_idempotency_key(p_idempotency_key);

  select id into request_id
  from public.approval_requests
  where submit_idempotency_key = p_idempotency_key;

  if found then
    return request_id;
  end if;

  request_id := public.submit_plan_unlocked(
    p_plan_version_id,
    p_idempotency_key,
    p_exception_flags
  );

  target_brand_id := public.plan_version_brand_id(p_plan_version_id);
  perform public.write_audit_event(
    target_brand_id,
    'plan_submitted',
    'plan_version',
    p_plan_version_id,
    p_idempotency_key,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'review_l1', 'approvalRequestId', request_id),
    jsonb_build_object('exceptionFlags', p_exception_flags)
  );

  return request_id;
end;
$$;

alter function public.approve_step(uuid, uuid, text)
  rename to approve_step_unlocked;

revoke all on function public.approve_step_unlocked(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.approve_step(
  p_approval_request_id uuid,
  p_idempotency_key uuid,
  p_comment text default null
)
returns public.approval_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_status public.approval_request_status;
  target_plan_version_id uuid;
  target_brand_id uuid;
  parent_plan_version_id uuid;
begin
  perform public.lock_action_idempotency_key(p_idempotency_key);

  select approval_requests.status into result_status
  from public.approval_steps
  join public.approval_requests
    on approval_requests.id = approval_steps.approval_request_id
  where approval_steps.action_idempotency_key = p_idempotency_key;

  if found then
    return result_status;
  end if;

  result_status := public.approve_step_unlocked(
    p_approval_request_id,
    p_idempotency_key,
    p_comment
  );

  select approval_requests.plan_version_id,
         planning_cycles.brand_id,
         plan_versions.parent_version_id
  into target_plan_version_id, target_brand_id, parent_plan_version_id
  from public.approval_requests
  join public.plan_versions
    on plan_versions.id = approval_requests.plan_version_id
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
  where approval_requests.id = p_approval_request_id;

  if result_status = 'approved' and parent_plan_version_id is not null then
    perform set_config('app.allow_plan_version_mutation', 'on', true);
    update public.plan_versions
    set status = 'superseded'
    where id = parent_plan_version_id
      and status = 'approved';
    perform set_config('app.allow_plan_version_mutation', 'off', true);
  end if;

  perform public.write_audit_event(
    target_brand_id,
    'approval_step_approved',
    'approval_request',
    p_approval_request_id,
    p_idempotency_key,
    null,
    jsonb_build_object('status', result_status),
    jsonb_build_object(
      'planVersionId', target_plan_version_id,
      'comment', p_comment
    )
  );

  return result_status;
end;
$$;

alter function public.request_changes(uuid, uuid, text)
  rename to request_changes_unlocked;

revoke all on function public.request_changes_unlocked(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.request_changes(
  p_approval_request_id uuid,
  p_idempotency_key uuid,
  p_comment text
)
returns public.approval_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_status public.approval_request_status;
  target_plan_version_id uuid;
  target_brand_id uuid;
begin
  perform public.lock_action_idempotency_key(p_idempotency_key);

  select approval_requests.status into result_status
  from public.approval_steps
  join public.approval_requests
    on approval_requests.id = approval_steps.approval_request_id
  where approval_steps.action_idempotency_key = p_idempotency_key;

  if found then
    return result_status;
  end if;

  result_status := public.request_changes_unlocked(
    p_approval_request_id,
    p_idempotency_key,
    p_comment
  );

  select approval_requests.plan_version_id, planning_cycles.brand_id
  into target_plan_version_id, target_brand_id
  from public.approval_requests
  join public.plan_versions
    on plan_versions.id = approval_requests.plan_version_id
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
  where approval_requests.id = p_approval_request_id;

  perform public.write_audit_event(
    target_brand_id,
    'approval_changes_requested',
    'approval_request',
    p_approval_request_id,
    p_idempotency_key,
    null,
    jsonb_build_object('status', result_status),
    jsonb_build_object(
      'planVersionId', target_plan_version_id,
      'comment', p_comment
    )
  );

  return result_status;
end;
$$;

revoke all on function public.guard_audit_events_append_only()
  from public, anon, authenticated;
revoke all on function public.lock_action_idempotency_key(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.write_audit_event(
  uuid, text, text, uuid, uuid, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.create_plan_revision(uuid, uuid)
  from public, anon;
revoke all on function public.save_draft_changes(uuid, integer, jsonb, uuid)
  from public, anon;

grant execute on function public.create_plan_revision(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.save_draft_changes(uuid, integer, jsonb, uuid)
  to authenticated, service_role;
grant execute on function public.commit_import_batch(uuid, uuid, boolean)
  to authenticated, service_role;
grant execute on function public.submit_plan(uuid, uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.approve_step(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.request_changes(uuid, uuid, text)
  to authenticated, service_role;

alter table public.action_idempotency enable row level security;
alter table public.audit_events enable row level security;
alter table public.version_diffs enable row level security;

create policy audit_events_select_by_access
on public.audit_events
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy version_diffs_select_by_access
on public.version_diffs
for select
to authenticated
using (public.can_access_brand(brand_id));

revoke all on table public.action_idempotency from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;
revoke all on table public.version_diffs from anon, authenticated;

grant select on table public.audit_events to authenticated;
grant select on table public.version_diffs to authenticated;

grant all on table public.action_idempotency to service_role;
grant all on table public.audit_events to service_role;
grant all on table public.version_diffs to service_role;

comment on table public.audit_events is
  'Append-only, brand-scoped record of import, planning, approval and revision actions.';
comment on function public.create_plan_revision(uuid, uuid) is
  'Idempotently copies an immutable plan snapshot into a new Draft revision.';
comment on function public.save_draft_changes(uuid, integer, jsonb, uuid) is
  'Applies existing-row Draft edits with compare-and-swap lock_version semantics.';
