-- Canonical purchase-wave month semantics.
-- `needed_month` is retained as a compatibility projection for the proposal
-- reader until the V2 dashboard/operations migration removes that consumer.
-- The source of truth is now the independent order_month/arrival_month pair.

begin;

alter table public.purchase_wave_revisions
  add column if not exists order_month date,
  add column if not exists arrival_month date;

update public.purchase_wave_revisions
set order_month = coalesce(order_month, needed_month),
    arrival_month = coalesce(arrival_month, needed_month)
where order_month is null or arrival_month is null;

create or replace function public.sync_purchase_wave_month_columns_v2()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Keep old direct inserts/revision restores safe during the expand/contract
  -- window. New commands always provide both canonical fields.
  if new.order_month is null then new.order_month := new.needed_month; end if;
  if new.arrival_month is null then new.arrival_month := new.needed_month; end if;
  if new.needed_month is null then new.needed_month := new.arrival_month; end if;
  if new.arrival_month is not null then new.needed_month := new.arrival_month; end if;
  return new;
end;
$$;

drop trigger if exists purchase_wave_month_columns_sync on public.purchase_wave_revisions;
create trigger purchase_wave_month_columns_sync
before insert or update on public.purchase_wave_revisions
for each row execute function public.sync_purchase_wave_month_columns_v2();

alter table public.purchase_wave_revisions
  alter column order_month set not null,
  alter column arrival_month set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_wave_revisions'::regclass
      and conname = 'purchase_wave_revisions_order_month_check'
  ) then
    alter table public.purchase_wave_revisions
      add constraint purchase_wave_revisions_order_month_check
      check (order_month = date_trunc('month', order_month)::date);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_wave_revisions'::regclass
      and conname = 'purchase_wave_revisions_arrival_month_check'
  ) then
    alter table public.purchase_wave_revisions
      add constraint purchase_wave_revisions_arrival_month_check
      check (arrival_month = date_trunc('month', arrival_month)::date);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_wave_revisions'::regclass
      and conname = 'purchase_wave_revisions_order_before_arrival_check'
  ) then
    alter table public.purchase_wave_revisions
      add constraint purchase_wave_revisions_order_before_arrival_check
      check (order_month <= arrival_month);
  end if;
end;
$$;

create index if not exists purchase_wave_revisions_revision_order_month_idx
  on public.purchase_wave_revisions(revision_id, order_month, arrival_month);

comment on column public.purchase_wave_revisions.order_month is
  'Canonical month in which the planned purchase order is placed.';
comment on column public.purchase_wave_revisions.arrival_month is
  'Canonical month in which the planned goods arrive.';
comment on column public.purchase_wave_revisions.needed_month is
  'Compatibility projection of arrival_month; do not use as the source of truth.';

create or replace function public.save_purchase_wave_allocations_v2(
  p_revision_id uuid,
  p_expected_lock_version integer,
  p_waves jsonb,
  p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  revision_row public.annual_plan_revisions%rowtype;
  cycle_row public.annual_plan_cycles%rowtype;
  annual_line public.annual_plan_lines%rowtype;
  wave_row jsonb;
  allocation_row jsonb;
  current_wave_id uuid;
  current_wave_revision_id uuid;
  allocation_product_id uuid;
  paid_qty integer;
  foc_qty integer;
  allocation_price numeric;
  order_month date;
  arrival_month date;
  paid_total bigint;
  foc_total bigint;
  actor_id uuid := (select auth.uid());
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
begin
  if not public.v2_annual_revision_access(p_revision_id, true) then
    raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DRAFT_FORBIDDEN';
  end if;
  if jsonb_typeof(p_waves) <> 'array' then
    raise exception using errcode = 'P0001', message = 'PURCHASE_WAVES_INVALID';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'action_idempotency_key_required';
  end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object(
    'revisionId', p_revision_id,
    'expectedLockVersion', p_expected_lock_version,
    'waves', p_waves
  );
  select * into existing_action from public.action_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'save_purchase_wave_allocations_v2'
       or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;

  select r.* into revision_row
  from public.annual_plan_revisions r
  where r.id = p_revision_id for update;
  select c.* into cycle_row
  from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  if revision_row.lock_version <> p_expected_lock_version then
    raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT';
  end if;

  -- The payload is the complete draft snapshot. Omitted planned waves may be
  -- removed, but ordered/supplier-confirmed/received waves are retained.
  delete from public.purchase_wave_revisions old_wave_revision
  using public.purchase_waves old_wave
  where old_wave.id = old_wave_revision.wave_id
    and old_wave_revision.revision_id = p_revision_id
    and old_wave.status = 'planned'
    and not exists (
      select 1 from jsonb_array_elements(p_waves) incoming
      where ((incoming ->> 'waveId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             and (incoming ->> 'waveId')::uuid = old_wave.id)
         or (nullif(incoming ->> 'waveId', '') is null
             and (incoming ->> 'waveNumber')::integer = old_wave.wave_number)
    );

  for wave_row in select * from jsonb_array_elements(p_waves) loop
    order_month := coalesce(nullif(wave_row ->> 'orderMonth', ''), nullif(wave_row ->> 'neededMonth', ''))::date;
    arrival_month := coalesce(nullif(wave_row ->> 'arrivalMonth', ''), nullif(wave_row ->> 'neededMonth', ''))::date;
    if order_month is null or arrival_month is null
       or order_month <> date_trunc('month', order_month)::date
       or arrival_month <> date_trunc('month', arrival_month)::date
       or extract(year from order_month) <> cycle_row.planning_year
       or extract(year from arrival_month) <> cycle_row.planning_year then
      raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_MONTH_INVALID';
    end if;
    if arrival_month < order_month then
      raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_ORDER_AFTER_ARRIVAL';
    end if;
    if coalesce((wave_row ->> 'waveNumber')::integer, 0) < 1 then
      raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_SEQUENCE_INVALID';
    end if;
    if (wave_row ->> 'waveId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      current_wave_id := (wave_row ->> 'waveId')::uuid;
    else
      current_wave_id := null;
    end if;
    if current_wave_id is null then
      insert into public.purchase_waves(cycle_id, wave_number, stable_key)
      values (cycle_row.id, (wave_row ->> 'waveNumber')::integer,
              format('%s-%s', cycle_row.id, (wave_row ->> 'waveNumber')::integer))
      on conflict (cycle_id, wave_number) do update set updated_at = now()
      returning id into current_wave_id;
    elsif not exists (
      select 1 from public.purchase_waves
      where id = current_wave_id and cycle_id = cycle_row.id
    ) then
      -- A client-side draft may send a UUID before the wave has been
      -- materialized. Treat that value as a new wave, but keep rejecting a
      -- real wave belonging to another cycle.
      if exists (select 1 from public.purchase_waves where id = current_wave_id) then
        raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_FORBIDDEN';
      end if;
      current_wave_id := null;
      insert into public.purchase_waves(cycle_id, wave_number, stable_key)
      values (cycle_row.id, (wave_row ->> 'waveNumber')::integer,
              format('%s-%s', cycle_row.id, (wave_row ->> 'waveNumber')::integer))
      on conflict (cycle_id, wave_number) do update set updated_at = now()
      returning id into current_wave_id;
    end if;

    insert into public.purchase_wave_revisions(
      wave_id, revision_id, order_month, arrival_month, needed_month
    ) values (
      current_wave_id, p_revision_id, order_month, arrival_month, arrival_month
    )
    on conflict (wave_id, revision_id) do update set
      order_month = excluded.order_month,
      arrival_month = excluded.arrival_month,
      needed_month = excluded.arrival_month,
      updated_at = now()
    returning id into current_wave_revision_id;

    delete from public.purchase_wave_allocations allocations
    where allocations.wave_revision_id = current_wave_revision_id;
    for allocation_row in select * from jsonb_array_elements(coalesce(wave_row -> 'allocations', '[]'::jsonb)) loop
      allocation_product_id := (allocation_row ->> 'productId')::uuid;
      select l.* into annual_line
      from public.annual_plan_lines l
      where l.revision_id = p_revision_id and l.product_id = allocation_product_id;
      if annual_line.id is null then
        raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_PRODUCT_UNKNOWN';
      end if;
      paid_qty := coalesce((allocation_row ->> 'paidQty')::integer, 0);
      foc_qty := coalesce((allocation_row ->> 'focQty')::integer, 0);
      allocation_price := coalesce((allocation_row ->> 'exPrice')::numeric, annual_line.ex_price);
      if paid_qty < 0 or foc_qty < 0 or allocation_price < 0 then
        raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_ALLOCATION_NEGATIVE';
      end if;
      if allocation_price <> annual_line.ex_price then
        raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_EX_PRICE_MISMATCH';
      end if;
      insert into public.purchase_wave_allocations(
        wave_revision_id, product_id, paid_qty, foc_qty, ex_price
      ) values (current_wave_revision_id, allocation_product_id, paid_qty, foc_qty, allocation_price);
    end loop;
  end loop;

  select coalesce(sum(a.paid_qty), 0), coalesce(sum(a.foc_qty), 0)
  into paid_total, foc_total
  from public.purchase_wave_allocations a
  join public.purchase_wave_revisions wr on wr.id = a.wave_revision_id
  where wr.revision_id = p_revision_id;
  if exists (
    select 1
    from public.annual_plan_lines l
    left join (
      select a.product_id, sum(a.paid_qty)::bigint paid_qty, sum(a.foc_qty)::bigint foc_qty
      from public.purchase_wave_allocations a
      join public.purchase_wave_revisions wr on wr.id = a.wave_revision_id
      where wr.revision_id = p_revision_id
      group by a.product_id
    ) totals on totals.product_id = l.product_id
    where l.revision_id = p_revision_id
      and (coalesce(totals.paid_qty, 0) <> l.annual_paid_qty
           or coalesce(totals.foc_qty, 0) <> l.annual_foc_qty)
  ) then
    raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_ALLOCATION_MISMATCH';
  end if;

  update public.annual_plan_revisions
  set lock_version = lock_version + 1, updated_at = now()
  where id = p_revision_id returning * into revision_row;
  request_payload := jsonb_build_object(
    'request', request_payload,
    'data', jsonb_build_object(
      'revisionId', p_revision_id,
      'lockVersion', revision_row.lock_version,
      'paidQty', paid_total,
      'focQty', foc_total,
      'waves', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', w.id,
          'sequence', w.wave_number,
          'orderMonth', to_char(wr.order_month, 'YYYY-MM'),
          'arrivalMonth', to_char(wr.arrival_month, 'YYYY-MM'),
          'neededMonth', to_char(wr.arrival_month, 'YYYY-MM'),
          'allocations', coalesce((
            select jsonb_agg(jsonb_build_object(
              'productId', a.product_id,
              'paidQty', a.paid_qty,
              'focQty', a.foc_qty,
              'exPrice', a.ex_price
            ) order by a.product_id)
            from public.purchase_wave_allocations a
            where a.wave_revision_id = wr.id
          ), '[]'::jsonb)
        ) order by w.wave_number)
        from public.purchase_wave_revisions wr
        join public.purchase_waves w on w.id = wr.wave_id
        where wr.revision_id = p_revision_id
      ), '[]'::jsonb)
    )
  );
  perform public.write_audit_event(
    cycle_row.brand_id, 'purchase_wave_allocations_saved',
    'annual_plan_revision', p_revision_id, p_idempotency_key, null,
    request_payload -> 'data', '{}'::jsonb
  );
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'save_purchase_wave_allocations_v2', p_revision_id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

create or replace function public.create_annual_plan_revision_v2(p_cycle_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  old_revision public.annual_plan_revisions%rowtype;
  new_revision public.annual_plan_revisions%rowtype;
  wave public.purchase_waves%rowtype;
  old_wave_revision public.purchase_wave_revisions%rowtype;
  new_wave_revision_id uuid;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  brand_id uuid;
begin
  if not exists (
    select 1 from public.annual_plan_cycles c
    where c.id = p_cycle_id and public.v2_annual_plan_authorized(c.brand_id)
  ) then
    raise exception using errcode = '42501', message = 'ANNUAL_PLAN_BRAND_ACCESS_REQUIRED';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'action_idempotency_key_required';
  end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('cycleId', p_cycle_id);
  select * into existing_action from public.action_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'create_annual_plan_revision_v2'
       or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(('annual-plan-revision:' || p_cycle_id::text), 0)
  );
  select c.brand_id into brand_id from public.annual_plan_cycles c where c.id = p_cycle_id;
  select * into old_revision
  from public.annual_plan_revisions
  where cycle_id = p_cycle_id and status = 'approved'
  order by revision_number desc limit 1;
  if old_revision.id is null then
    raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_SOURCE_NOT_APPROVED';
  end if;
  insert into public.annual_plan_revisions(cycle_id, revision_number, owner_id)
  select p_cycle_id, coalesce(max(revision_number), 0) + 1, actor_id
  from public.annual_plan_revisions where cycle_id = p_cycle_id
  returning * into new_revision;
  insert into public.annual_plan_lines(
    revision_id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price
  )
  select new_revision.id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price
  from public.annual_plan_lines where revision_id = old_revision.id;
  for wave in select * from public.purchase_waves where cycle_id = p_cycle_id loop
    for old_wave_revision in select * from public.purchase_wave_revisions
      where wave_id = wave.id and revision_id = old_revision.id loop
      insert into public.purchase_wave_revisions(
        wave_id, revision_id, order_month, arrival_month, needed_month
      ) values (
        wave.id, new_revision.id, old_wave_revision.order_month,
        old_wave_revision.arrival_month, old_wave_revision.arrival_month
      ) returning id into new_wave_revision_id;
      insert into public.purchase_wave_allocations(
        wave_revision_id, product_id, paid_qty, foc_qty, ex_price
      )
      select new_wave_revision_id, product_id, paid_qty, foc_qty, ex_price
      from public.purchase_wave_allocations
      where wave_revision_id = old_wave_revision.id;
    end loop;
  end loop;
  request_payload := jsonb_build_object(
    'request', request_payload,
    'data', jsonb_build_object(
      'cycleId', p_cycle_id, 'revisionId', new_revision.id,
      'revisionNumber', new_revision.revision_number, 'status', new_revision.status
    )
  );
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'create_annual_plan_revision_v2', new_revision.id, request_payload, actor_id);
  perform public.write_audit_event(
    brand_id, 'annual_plan_revision_created', 'annual_plan_revision', new_revision.id,
    p_idempotency_key, null, request_payload -> 'data', '{}'::jsonb
  );
  return request_payload -> 'data';
end;
$$;

create or replace function public.v2_request_annual_plan_changes_core(
  p_revision_id uuid,
  p_comment text,
  p_idempotency_key uuid,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  revision_row public.annual_plan_revisions%rowtype;
  cycle_row public.annual_plan_cycles%rowtype;
  case_row public.workflow_approval_cases%rowtype;
  step_row public.workflow_approval_steps%rowtype;
  new_revision public.annual_plan_revisions%rowtype;
  wave public.purchase_waves%rowtype;
  old_wave_revision public.purchase_wave_revisions%rowtype;
  new_wave_revision_id uuid;
begin
  if nullif(btrim(coalesce(p_comment, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_COMMENT_REQUIRED';
  end if;
  select r.* into revision_row from public.annual_plan_revisions r
  where r.id = p_revision_id for update;
  select c.* into cycle_row from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  select c.* into case_row from public.workflow_approval_cases c
  where c.target_kind = 'annual_plan' and c.target_id = p_revision_id and c.status = 'pending'
  for update;
  if case_row.id is null then
    raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_ALREADY_DECIDED';
  end if;
  select s.* into step_row from public.workflow_approval_steps s
  where s.case_id = case_row.id and s.status = 'pending' and s.assignee_id = p_actor_id
  for update;
  if step_row.id is null then
    raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DECISION_FORBIDDEN';
  end if;
  update public.workflow_approval_steps
  set status = 'changes_requested', acted_by = p_actor_id, acted_at = now(),
      comment = btrim(p_comment), updated_at = now()
  where id = step_row.id;
  update public.workflow_approval_cases
  set status = 'changes_requested', completed_at = now(), updated_at = now()
  where id = case_row.id;
  insert into public.workflow_approval_decisions(
    case_id, step_id, decision, comment, decided_by, idempotency_key
  ) values (
    case_row.id, step_row.id, 'request_changes', btrim(p_comment), p_actor_id, p_idempotency_key
  );
  update public.annual_plan_revisions
  set status = 'changes_requested', updated_at = now()
  where id = p_revision_id;
  insert into public.annual_plan_revisions(cycle_id, revision_number, owner_id)
  select cycle_row.id, coalesce(max(revision_number), 0) + 1, revision_row.owner_id
  from public.annual_plan_revisions where cycle_id = cycle_row.id
  returning * into new_revision;
  insert into public.annual_plan_lines(
    revision_id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price
  )
  select new_revision.id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price
  from public.annual_plan_lines where revision_id = p_revision_id;
  for wave in select * from public.purchase_waves where cycle_id = cycle_row.id loop
    for old_wave_revision in select * from public.purchase_wave_revisions
      where wave_id = wave.id and revision_id = p_revision_id loop
      insert into public.purchase_wave_revisions(
        wave_id, revision_id, order_month, arrival_month, needed_month
      ) values (
        wave.id, new_revision.id, old_wave_revision.order_month,
        old_wave_revision.arrival_month, old_wave_revision.arrival_month
      ) returning id into new_wave_revision_id;
      insert into public.purchase_wave_allocations(
        wave_revision_id, product_id, paid_qty, foc_qty, ex_price
      )
      select new_wave_revision_id, product_id, paid_qty, foc_qty, ex_price
      from public.purchase_wave_allocations where wave_revision_id = old_wave_revision.id;
    end loop;
  end loop;
  perform public.write_audit_event(
    cycle_row.brand_id, 'annual_plan_changes_requested', 'annual_plan_revision',
    p_revision_id, p_idempotency_key, null,
    jsonb_build_object('newRevisionId', new_revision.id, 'comment', btrim(p_comment)),
    jsonb_build_object('source', 'v2')
  );
  return jsonb_build_object(
    'previousRevisionId', p_revision_id, 'revisionId', new_revision.id,
    'revisionNumber', new_revision.revision_number, 'status', new_revision.status,
    'comment', btrim(p_comment)
  );
end;
$$;

-- Excel apply is redefined so the preview/checkpoint path carries both months
-- into the canonical allocation command instead of collapsing them.
create or replace function public.apply_annual_plan_excel_v2(
  p_revision_id uuid,
  p_expected_lock_version integer,
  p_import_session_id uuid,
  p_checksum text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  revision_row public.annual_plan_revisions%rowtype;
  cycle_row public.annual_plan_cycles%rowtype;
  staging_row public.annual_plan_excel_staging%rowtype;
  checkpoint_id uuid;
  before_lines jsonb;
  before_waves jsonb;
  source_payload jsonb;
  resolved_lines jsonb := '[]'::jsonb;
  resolved_waves jsonb := '[]'::jsonb;
  line_row jsonb;
  wave_row jsonb;
  allocation_row jsonb;
  product_row public.products%rowtype;
  product_id uuid;
  requested_sku text;
  save_result jsonb;
  current_lock integer;
  request_payload jsonb;
  existing_action public.action_idempotency%rowtype;
begin
  if not public.v2_annual_revision_access(p_revision_id, true) then
    raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DRAFT_FORBIDDEN';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'action_idempotency_key_required';
  end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object(
    'revisionId', p_revision_id, 'expectedLockVersion', p_expected_lock_version,
    'importSessionId', p_import_session_id, 'checksum', lower(p_checksum),
    'payload', coalesce(p_payload, '{}'::jsonb)
  );
  select * into existing_action from public.action_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'apply_annual_plan_excel_v2'
       or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;
  select * into revision_row from public.annual_plan_revisions
  where id = p_revision_id for update;
  select * into cycle_row from public.annual_plan_cycles
  where id = revision_row.cycle_id;
  if revision_row.lock_version <> p_expected_lock_version then
    raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT';
  end if;
  select * into staging_row from public.annual_plan_excel_staging
  where import_session_id = p_import_session_id and revision_id = p_revision_id
  for update;
  if staging_row.id is null or staging_row.checksum <> lower(p_checksum) then
    raise exception using errcode = 'P0001', message = 'EXCEL_CHECKSUM_MISMATCH';
  end if;
  if staging_row.status = 'applied' then
    raise exception using errcode = 'P0001', message = 'EXCEL_IMPORT_ALREADY_APPLIED';
  end if;
  source_payload := case
    when jsonb_typeof(coalesce(p_payload, '{}'::jsonb) -> 'lines') = 'array' then p_payload
    else staging_row.payload
  end;
  if coalesce(source_payload -> 'replaceSections', '[]'::jsonb) <> '["lines","waves"]'::jsonb then
    raise exception using errcode = 'P0001', message = 'EXCEL_REPLACE_CONFIRMATION_REQUIRED';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(staging_row.diagnostics, '[]'::jsonb)) item
    where item ->> 'severity' = 'error'
  ) then
    raise exception using errcode = 'P0001', message = 'EXCEL_PREVIEW_HAS_ERRORS';
  end if;
  if jsonb_typeof(source_payload -> 'lines') <> 'array'
     or jsonb_typeof(source_payload -> 'waves') <> 'array' then
    raise exception using errcode = 'P0001', message = 'EXCEL_PAYLOAD_INVALID';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'productId', l.product_id, 'openingStock', l.opening_stock,
    'annualPaidQty', l.annual_paid_qty, 'annualFocQty', l.annual_foc_qty,
    'exPrice', l.ex_price
  ) order by l.product_id), '[]'::jsonb)
  into before_lines
  from public.annual_plan_lines l where l.revision_id = p_revision_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'waveId', w.id, 'waveNumber', w.wave_number,
    'orderMonth', to_char(wr.order_month, 'YYYY-MM-DD'),
    'arrivalMonth', to_char(wr.arrival_month, 'YYYY-MM-DD'),
    'neededMonth', to_char(wr.arrival_month, 'YYYY-MM-DD'),
    'allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', a.product_id, 'paidQty', a.paid_qty,
        'focQty', a.foc_qty, 'exPrice', a.ex_price
      ) order by a.product_id)
      from public.purchase_wave_allocations a where a.wave_revision_id = wr.id
    ), '[]'::jsonb)
  ) order by w.wave_number), '[]'::jsonb)
  into before_waves
  from public.purchase_wave_revisions wr
  join public.purchase_waves w on w.id = wr.wave_id
  where wr.revision_id = p_revision_id;
  insert into public.annual_plan_excel_checkpoints(
    revision_id, lock_version, checksum, before_lines, before_waves, created_by
  ) values (
    p_revision_id, p_expected_lock_version, lower(p_checksum),
    before_lines, before_waves, actor_id
  ) returning id into checkpoint_id;

  for line_row in select * from pg_catalog.jsonb_array_elements(source_payload -> 'lines') loop
    requested_sku := upper(btrim(line_row ->> 'sku'));
    product_id := null;
    if (line_row ->> 'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select * into product_row from public.products
      where id = (line_row ->> 'productId')::uuid
        and brand_id = cycle_row.brand_id and is_active for update;
      if product_row.id is not null then
        product_id := product_row.id; requested_sku := product_row.canonical_sku;
      end if;
    end if;
    if product_id is null then
      select p.* into product_row from public.products p
      left join public.sku_aliases alias_row on alias_row.product_id = p.id
      where p.brand_id = cycle_row.brand_id and p.is_active
        and (p.canonical_sku = requested_sku or alias_row.alias_sku = requested_sku)
      limit 1 for update of p;
      if product_row.id is not null then
        product_id := product_row.id; requested_sku := product_row.canonical_sku;
      end if;
    end if;
    if product_id is null then
      if nullif(btrim(line_row ->> 'name'), '') is null then
        raise exception using errcode = 'P0001', message = 'EXCEL_NEW_SKU_NAME_REQUIRED';
      end if;
      insert into public.products(brand_id, canonical_sku, name, is_active)
      values (cycle_row.brand_id, requested_sku, btrim(line_row ->> 'name'), true)
      returning * into product_row;
      product_id := product_row.id;
    end if;
    resolved_lines := resolved_lines || jsonb_build_array(jsonb_build_object(
      'productId', product_id,
      'openingStock', coalesce((line_row ->> 'openingStock')::integer, 0),
      'annualPaidQty', coalesce((line_row ->> 'paidQty')::integer, 0),
      'annualFocQty', coalesce((line_row ->> 'expectedFoc')::integer, 0),
      'exPrice', coalesce(line_row ->> 'exPrice', '0')
    ));
  end loop;

  for wave_row in select * from pg_catalog.jsonb_array_elements(source_payload -> 'waves') loop
    declare
      resolved_allocations jsonb := '[]'::jsonb;
      wave_number integer := coalesce((wave_row ->> 'sequence')::integer, 0);
      order_month text := coalesce(wave_row ->> 'orderMonth', wave_row ->> 'neededMonth');
      arrival_month text := coalesce(wave_row ->> 'arrivalMonth', wave_row ->> 'neededMonth');
    begin
      for allocation_row in select * from pg_catalog.jsonb_array_elements(
        coalesce(wave_row -> 'allocations', '[]'::jsonb)
      ) loop
        requested_sku := upper(btrim(allocation_row ->> 'sku'));
        product_id := null;
        select p.id, p.canonical_sku into product_id, requested_sku
        from public.products p
        left join public.sku_aliases alias_row on alias_row.product_id = p.id
        where p.brand_id = cycle_row.brand_id and p.is_active
          and (p.canonical_sku = requested_sku or alias_row.alias_sku = requested_sku)
        limit 1;
        if product_id is null then
          raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_PRODUCT_UNKNOWN';
        end if;
        resolved_allocations := resolved_allocations || jsonb_build_array(jsonb_build_object(
          'productId', product_id,
          'paidQty', coalesce((allocation_row ->> 'paidQty')::integer, 0),
          'focQty', coalesce((allocation_row ->> 'focQty')::integer, 0),
          'exPrice', coalesce(allocation_row ->> 'exPrice', '0')
        ));
      end loop;
      if length(order_month) = 7 then order_month := order_month || '-01'; end if;
      if length(arrival_month) = 7 then arrival_month := arrival_month || '-01'; end if;
      resolved_waves := resolved_waves || jsonb_build_array(jsonb_build_object(
        'waveId', nullif(wave_row ->> 'id', ''),
        'waveNumber', wave_number,
        'orderMonth', order_month,
        'arrivalMonth', arrival_month,
        'allocations', resolved_allocations
      ));
    end;
  end loop;

  save_result := public.save_annual_plan_lines_v2(
    p_revision_id, p_expected_lock_version, resolved_lines, gen_random_uuid()
  );
  current_lock := (save_result ->> 'lockVersion')::integer;
  save_result := public.save_purchase_wave_allocations_v2(
    p_revision_id, current_lock, resolved_waves, gen_random_uuid()
  );
  current_lock := (save_result ->> 'lockVersion')::integer;
  update public.annual_plan_excel_staging
  set status = 'applied', applied_at = now() where id = staging_row.id;
  perform public.write_audit_event(
    cycle_row.brand_id, 'annual_plan_excel_applied', 'annual_plan_revision',
    p_revision_id, p_idempotency_key, before_lines,
    jsonb_build_object('checkpointId', checkpoint_id, 'lockVersion', current_lock, 'checksum', lower(p_checksum)),
    jsonb_build_object('source', 'v2_excel')
  );
  request_payload := jsonb_build_object(
    'request', request_payload,
    'data', jsonb_build_object(
      'revisionId', p_revision_id, 'checkpointId', checkpoint_id,
      'lockVersion', current_lock, 'checksum', lower(p_checksum)
    )
  );
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'apply_annual_plan_excel_v2', p_revision_id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

revoke all on function public.sync_purchase_wave_month_columns_v2() from public, anon, authenticated;
grant execute on function public.sync_purchase_wave_month_columns_v2() to service_role;

commit;
