-- Generated Excel adapter for annual-plan V2.
-- The adapter is staging-first: no business row changes until the apply command
-- validates ownership, lock version and explicit replacement in one transaction.

create table if not exists public.annual_plan_excel_staging (
  id uuid primary key default gen_random_uuid(),
  import_session_id uuid not null unique,
  revision_id uuid not null references public.annual_plan_revisions(id) on delete cascade,
  lock_version integer not null check (lock_version >= 0),
  checksum text not null check (checksum ~ '^[0-9a-fA-F]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  diagnostics jsonb not null default '[]'::jsonb check (jsonb_typeof(diagnostics) = 'array'),
  status text not null default 'previewed' check (status in ('previewed', 'invalid', 'applied', 'superseded')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (revision_id, checksum)
);

create table if not exists public.annual_plan_excel_checkpoints (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.annual_plan_revisions(id) on delete cascade,
  lock_version integer not null check (lock_version >= 0),
  checksum text not null check (checksum ~ '^[0-9a-fA-F]{64}$'),
  replace_sections text[] not null default array['lines', 'waves']::text[] check (replace_sections = array['lines', 'waves']::text[]),
  before_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(before_lines) = 'array'),
  before_waves jsonb not null default '[]'::jsonb check (jsonb_typeof(before_waves) = 'array'),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  restored_at timestamptz
);

create index if not exists annual_plan_excel_staging_revision_idx
  on public.annual_plan_excel_staging (revision_id, created_at desc);
create index if not exists annual_plan_excel_checkpoints_revision_idx
  on public.annual_plan_excel_checkpoints (revision_id, created_at desc);

alter table public.annual_plan_excel_staging enable row level security;
alter table public.annual_plan_excel_checkpoints enable row level security;

drop policy if exists annual_plan_excel_staging_owner_select on public.annual_plan_excel_staging;
drop policy if exists annual_plan_excel_checkpoints_owner_select on public.annual_plan_excel_checkpoints;
create policy annual_plan_excel_staging_owner_select on public.annual_plan_excel_staging
  for select to authenticated using (
    public.v2_annual_revision_access(revision_id, false)
    and exists (
      select 1 from public.annual_plan_revisions r
      where r.id = revision_id and r.owner_id = (select auth.uid()) and r.status = 'draft_owner_only'
    )
  );
create policy annual_plan_excel_checkpoints_owner_select on public.annual_plan_excel_checkpoints
  for select to authenticated using (
    exists (
      select 1 from public.annual_plan_revisions r
      where r.id = revision_id and r.owner_id = (select auth.uid()) and r.status = 'draft_owner_only'
    )
  );

revoke all on table public.annual_plan_excel_staging, public.annual_plan_excel_checkpoints from anon, authenticated;
grant select on table public.annual_plan_excel_staging, public.annual_plan_excel_checkpoints to authenticated;

create or replace function public.stage_annual_plan_excel_v2(
  p_revision_id uuid,
  p_lock_version integer,
  p_import_session_id uuid,
  p_checksum text,
  p_payload jsonb,
  p_diagnostics jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  revision_row public.annual_plan_revisions%rowtype;
  brand_id uuid;
  staging_row public.annual_plan_excel_staging%rowtype;
  next_status text := 'previewed';
begin
  if not public.v2_annual_revision_access(p_revision_id, true) then
    raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DRAFT_FORBIDDEN';
  end if;
  if p_import_session_id is null
     or p_checksum !~ '^[0-9a-fA-F]{64}$'
     or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(coalesce(p_diagnostics, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'EXCEL_STAGING_INPUT_INVALID';
  end if;
  select * into revision_row from public.annual_plan_revisions where id = p_revision_id for update;
  if revision_row.lock_version <> p_lock_version then
    raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(p_diagnostics, '[]'::jsonb)) item where item ->> 'severity' = 'error') then
    next_status := 'invalid';
  end if;
  select * into staging_row from public.annual_plan_excel_staging where import_session_id = p_import_session_id for update;
  if staging_row.id is not null then
    if staging_row.revision_id <> p_revision_id
       or staging_row.checksum <> lower(p_checksum)
       or staging_row.payload <> p_payload then
      raise exception using errcode = 'P0001', message = 'EXCEL_STAGING_SESSION_REUSED';
    end if;
    return jsonb_build_object('importSessionId', staging_row.import_session_id, 'checksum', staging_row.checksum, 'status', staging_row.status);
  end if;
  select * into staging_row from public.annual_plan_excel_staging where revision_id = p_revision_id and checksum = lower(p_checksum) for update;
  if staging_row.id is not null then
    return jsonb_build_object('importSessionId', staging_row.import_session_id, 'checksum', staging_row.checksum, 'status', staging_row.status);
  end if;
  insert into public.annual_plan_excel_staging(import_session_id, revision_id, lock_version, checksum, payload, diagnostics, status, created_by)
  values (p_import_session_id, p_revision_id, p_lock_version, lower(p_checksum), p_payload, coalesce(p_diagnostics, '[]'::jsonb), next_status, actor_id)
  returning * into staging_row;
  select c.brand_id into brand_id from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  perform public.write_audit_event(brand_id, 'annual_plan_excel_previewed', 'annual_plan_revision', p_revision_id, null, null,
    jsonb_build_object('importSessionId', p_import_session_id, 'checksum', lower(p_checksum), 'status', next_status),
    jsonb_build_object('source', 'v2_excel'));
  return jsonb_build_object('importSessionId', staging_row.import_session_id, 'checksum', staging_row.checksum, 'status', staging_row.status);
end;
$$;

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
    'revisionId', p_revision_id,
    'expectedLockVersion', p_expected_lock_version,
    'importSessionId', p_import_session_id,
    'checksum', lower(p_checksum),
    'payload', coalesce(p_payload, '{}'::jsonb)
  );
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'apply_annual_plan_excel_v2'
       or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;
  select * into revision_row from public.annual_plan_revisions where id = p_revision_id for update;
  select * into cycle_row from public.annual_plan_cycles where id = revision_row.cycle_id;
  if revision_row.lock_version <> p_expected_lock_version then
    raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT';
  end if;
  select * into staging_row
    from public.annual_plan_excel_staging
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
  if exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(staging_row.diagnostics, '[]'::jsonb)) item where item ->> 'severity' = 'error') then
    raise exception using errcode = 'P0001', message = 'EXCEL_PREVIEW_HAS_ERRORS';
  end if;
  if jsonb_typeof(source_payload -> 'lines') <> 'array'
     or jsonb_typeof(source_payload -> 'waves') <> 'array' then
    raise exception using errcode = 'P0001', message = 'EXCEL_PAYLOAD_INVALID';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'productId', l.product_id,
    'openingStock', l.opening_stock,
    'annualPaidQty', l.annual_paid_qty,
    'annualFocQty', l.annual_foc_qty,
    'exPrice', l.ex_price
  ) order by l.product_id), '[]'::jsonb)
    into before_lines
    from public.annual_plan_lines l where l.revision_id = p_revision_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'waveId', w.id,
    'waveNumber', w.wave_number,
    'neededMonth', to_char(wr.needed_month, 'YYYY-MM-DD'),
    'allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', a.product_id, 'paidQty', a.paid_qty, 'focQty', a.foc_qty, 'exPrice', a.ex_price
      ) order by a.product_id)
      from public.purchase_wave_allocations a where a.wave_revision_id = wr.id
    ), '[]'::jsonb)
  ) order by w.wave_number), '[]'::jsonb)
    into before_waves
    from public.purchase_wave_revisions wr
    join public.purchase_waves w on w.id = wr.wave_id
    where wr.revision_id = p_revision_id;
  insert into public.annual_plan_excel_checkpoints(revision_id, lock_version, checksum, before_lines, before_waves, created_by)
  values (p_revision_id, p_expected_lock_version, lower(p_checksum), before_lines, before_waves, actor_id)
  returning id into checkpoint_id;

  for line_row in select * from pg_catalog.jsonb_array_elements(source_payload -> 'lines') loop
    requested_sku := upper(btrim(line_row ->> 'sku'));
    product_id := null;
    if (line_row ->> 'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select * into product_row
        from public.products
        where id = (line_row ->> 'productId')::uuid and brand_id = cycle_row.brand_id and is_active
        for update;
      if product_row.id is not null then product_id := product_row.id; requested_sku := product_row.canonical_sku; end if;
    end if;
    if product_id is null then
      select p.* into product_row
        from public.products p
        left join public.sku_aliases alias_row on alias_row.product_id = p.id
        where p.brand_id = cycle_row.brand_id and p.is_active
          and (p.canonical_sku = requested_sku or alias_row.alias_sku = requested_sku)
        limit 1 for update of p;
      if product_row.id is not null then product_id := product_row.id; requested_sku := product_row.canonical_sku; end if;
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
      needed_month text := coalesce(wave_row ->> 'orderMonth', wave_row ->> 'arrivalMonth');
    begin
      for allocation_row in select * from pg_catalog.jsonb_array_elements(coalesce(wave_row -> 'allocations', '[]'::jsonb)) loop
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
      if length(needed_month) = 7 then needed_month := needed_month || '-01'; end if;
      resolved_waves := resolved_waves || jsonb_build_array(jsonb_build_object(
        'waveId', nullif(wave_row ->> 'id', ''),
        'waveNumber', wave_number,
        'neededMonth', needed_month,
        'allocations', resolved_allocations
      ));
    end;
  end loop;

  save_result := public.save_annual_plan_lines_v2(p_revision_id, p_expected_lock_version, resolved_lines, gen_random_uuid());
  current_lock := (save_result ->> 'lockVersion')::integer;
  save_result := public.save_purchase_wave_allocations_v2(p_revision_id, current_lock, resolved_waves, gen_random_uuid());
  current_lock := (save_result ->> 'lockVersion')::integer;
  update public.annual_plan_excel_staging set status = 'applied', applied_at = now() where id = staging_row.id;
  perform public.write_audit_event(
    cycle_row.brand_id,
    'annual_plan_excel_applied',
    'annual_plan_revision',
    p_revision_id,
    p_idempotency_key,
    before_lines,
    jsonb_build_object('checkpointId', checkpoint_id, 'lockVersion', current_lock, 'checksum', lower(p_checksum)),
    jsonb_build_object('source', 'v2_excel')
  );
  request_payload := jsonb_build_object(
    'request', request_payload,
    'data', jsonb_build_object('revisionId', p_revision_id, 'checkpointId', checkpoint_id, 'lockVersion', current_lock, 'checksum', lower(p_checksum))
  );
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'apply_annual_plan_excel_v2', p_revision_id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

create or replace function public.restore_annual_plan_excel_checkpoint_v2(
  p_checkpoint_id uuid,
  p_expected_lock_version integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  checkpoint_row public.annual_plan_excel_checkpoints%rowtype;
  revision_row public.annual_plan_revisions%rowtype;
  save_result jsonb;
  current_lock integer;
begin
  select * into checkpoint_row from public.annual_plan_excel_checkpoints where id = p_checkpoint_id for update;
  if checkpoint_row.id is null then raise exception using errcode = 'P0001', message = 'EXCEL_CHECKPOINT_NOT_FOUND'; end if;
  if not public.v2_annual_revision_access(checkpoint_row.revision_id, true) then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DRAFT_FORBIDDEN'; end if;
  select * into revision_row from public.annual_plan_revisions where id = checkpoint_row.revision_id for update;
  if revision_row.lock_version <> p_expected_lock_version then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT'; end if;
  save_result := public.save_annual_plan_lines_v2(checkpoint_row.revision_id, p_expected_lock_version, checkpoint_row.before_lines, gen_random_uuid());
  current_lock := (save_result ->> 'lockVersion')::integer;
  save_result := public.save_purchase_wave_allocations_v2(checkpoint_row.revision_id, current_lock, checkpoint_row.before_waves, gen_random_uuid());
  current_lock := (save_result ->> 'lockVersion')::integer;
  update public.annual_plan_excel_checkpoints set restored_at = now() where id = checkpoint_row.id;
  perform public.write_audit_event(
    (select c.brand_id from public.annual_plan_cycles c where c.id = revision_row.cycle_id),
    'annual_plan_excel_checkpoint_restored',
    'annual_plan_revision',
    checkpoint_row.revision_id,
    p_idempotency_key,
    null,
    jsonb_build_object('checkpointId', checkpoint_row.id, 'lockVersion', current_lock),
    jsonb_build_object('source', 'v2_excel')
  );
  return jsonb_build_object('checkpointId', checkpoint_row.id, 'revisionId', checkpoint_row.revision_id, 'lockVersion', current_lock);
end;
$$;

revoke all on function public.stage_annual_plan_excel_v2(uuid, integer, uuid, text, jsonb, jsonb), public.apply_annual_plan_excel_v2(uuid, integer, uuid, text, jsonb, uuid), public.restore_annual_plan_excel_checkpoint_v2(uuid, integer, uuid) from public, anon;
grant execute on function public.stage_annual_plan_excel_v2(uuid, integer, uuid, text, jsonb, jsonb), public.apply_annual_plan_excel_v2(uuid, integer, uuid, text, jsonb, uuid), public.restore_annual_plan_excel_checkpoint_v2(uuid, integer, uuid) to authenticated, service_role;
