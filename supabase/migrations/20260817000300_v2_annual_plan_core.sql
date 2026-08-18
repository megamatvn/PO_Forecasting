-- Annual-plan V2 core. Legacy planning_* tables remain available until the
-- explicit cutover task; this schema provides the owner-private workflow.

do $$ begin
  create type public.annual_plan_status as enum ('draft_owner_only','pending_executive','approved','changes_requested','rejected','withdrawn','superseded');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.purchase_wave_status as enum ('planned','ordered','supplier_confirmed','received','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.annual_plan_cycles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  planning_year integer not null check (planning_year between 2000 and 2200),
  currency_code text not null default 'EUR' check (currency_code = upper(currency_code) and length(currency_code) = 3),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, planning_year)
);

create table if not exists public.annual_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.annual_plan_cycles(id),
  revision_number integer not null check (revision_number > 0),
  owner_id uuid not null references public.profiles(id),
  status public.annual_plan_status not null default 'draft_owner_only',
  assigned_executive_id uuid references public.profiles(id),
  lock_version integer not null default 0 check (lock_version >= 0),
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, revision_number)
);

create unique index if not exists annual_plan_one_draft_owner_idx
  on public.annual_plan_revisions (cycle_id, owner_id)
  where status = 'draft_owner_only';

create unique index if not exists annual_plan_one_active_workflow_idx
  on public.annual_plan_revisions (cycle_id)
  where status in ('draft_owner_only', 'pending_executive', 'changes_requested');

create table if not exists public.annual_plan_lines (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.annual_plan_revisions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  opening_stock integer not null default 0 check (opening_stock >= 0),
  annual_paid_qty integer not null default 0 check (annual_paid_qty >= 0),
  annual_foc_qty integer not null default 0 check (annual_foc_qty >= 0),
  ex_price numeric(18,6) not null default 0 check (ex_price >= 0),
  amount numeric(20,2) generated always as (round(annual_paid_qty::numeric * ex_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revision_id, product_id)
);

create table if not exists public.purchase_waves (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.annual_plan_cycles(id),
  wave_number integer not null check (wave_number > 0),
  stable_key text not null,
  status public.purchase_wave_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, wave_number),
  unique (cycle_id, stable_key)
);

create table if not exists public.purchase_wave_revisions (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references public.purchase_waves(id),
  revision_id uuid not null references public.annual_plan_revisions(id) on delete cascade,
  needed_month date not null check (needed_month = date_trunc('month', needed_month)::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wave_id, revision_id)
);

create table if not exists public.purchase_wave_allocations (
  id uuid primary key default gen_random_uuid(),
  wave_revision_id uuid not null references public.purchase_wave_revisions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  paid_qty integer not null default 0 check (paid_qty >= 0),
  foc_qty integer not null default 0 check (foc_qty >= 0),
  ex_price numeric(18,6) not null default 0 check (ex_price >= 0),
  amount numeric(20,2) generated always as (round(paid_qty::numeric * ex_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wave_revision_id, product_id)
);

create index if not exists annual_plan_revisions_owner_status_idx on public.annual_plan_revisions(owner_id, status);
create index if not exists annual_plan_revisions_cycle_status_idx on public.annual_plan_revisions(cycle_id, status);
create index if not exists annual_plan_lines_revision_product_idx on public.annual_plan_lines(revision_id, product_id);
create index if not exists purchase_waves_cycle_number_idx on public.purchase_waves(cycle_id, wave_number);
create index if not exists purchase_wave_revisions_revision_idx on public.purchase_wave_revisions(revision_id);
create index if not exists purchase_wave_allocations_product_idx on public.purchase_wave_allocations(product_id);

alter table public.annual_plan_cycles enable row level security;
alter table public.annual_plan_revisions enable row level security;
alter table public.annual_plan_lines enable row level security;
alter table public.purchase_waves enable row level security;
alter table public.purchase_wave_revisions enable row level security;
alter table public.purchase_wave_allocations enable row level security;

drop policy if exists annual_plan_cycles_select_scoped on public.annual_plan_cycles;
drop policy if exists annual_plan_revisions_select_owner_or_approval on public.annual_plan_revisions;
drop policy if exists annual_plan_lines_select_revision_access on public.annual_plan_lines;
drop policy if exists purchase_waves_select_revision_access on public.purchase_waves;
drop policy if exists purchase_wave_revisions_select_revision_access on public.purchase_wave_revisions;
drop policy if exists purchase_wave_allocations_select_revision_access on public.purchase_wave_allocations;

create policy annual_plan_cycles_select_scoped on public.annual_plan_cycles for select to authenticated using (
  (public.current_profile_is_active() and exists (select 1 from public.annual_plan_revisions r where r.cycle_id = id and r.owner_id = (select auth.uid()) and r.status = 'draft_owner_only'))
  or public.current_user_is_administrator_v2()
  or public.can_use_brand_capability(brand_id, 'view_approved_plan'::public.user_capability)
);
create policy annual_plan_revisions_select_owner_or_approval on public.annual_plan_revisions for select to authenticated using (
  (public.current_profile_is_active() and status = 'draft_owner_only' and owner_id = (select auth.uid()))
  or (public.current_profile_is_active() and status = 'pending_executive' and (owner_id = (select auth.uid()) or assigned_executive_id = (select auth.uid())))
  or (public.current_profile_is_active() and status = 'approved' and exists (select 1 from public.annual_plan_cycles c where c.id = cycle_id and public.can_use_brand_capability(c.brand_id, 'view_approved_plan'::public.user_capability)))
  or public.current_user_is_administrator_v2()
);
create policy annual_plan_lines_select_revision_access on public.annual_plan_lines for select to authenticated using (exists (select 1 from public.annual_plan_revisions r where r.id = revision_id));
create policy purchase_waves_select_revision_access on public.purchase_waves for select to authenticated using (exists (select 1 from public.purchase_wave_revisions wr join public.annual_plan_revisions r on r.id = wr.revision_id where wr.wave_id = public.purchase_waves.id));
create policy purchase_wave_revisions_select_revision_access on public.purchase_wave_revisions for select to authenticated using (exists (select 1 from public.annual_plan_revisions r where r.id = revision_id));
create policy purchase_wave_allocations_select_revision_access on public.purchase_wave_allocations for select to authenticated using (exists (select 1 from public.purchase_wave_revisions wr join public.annual_plan_revisions r on r.id = wr.revision_id where wr.id = wave_revision_id));

revoke all on table public.annual_plan_cycles, public.annual_plan_revisions, public.annual_plan_lines, public.purchase_waves, public.purchase_wave_revisions, public.purchase_wave_allocations from anon, authenticated;
grant select on table public.annual_plan_cycles, public.annual_plan_revisions, public.annual_plan_lines, public.purchase_waves, public.purchase_wave_revisions, public.purchase_wave_allocations to authenticated;

create or replace function public.v2_annual_plan_authorized(p_brand_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_profile_is_active() and (public.current_user_is_administrator_v2() or public.can_use_brand_capability(p_brand_id, 'create_annual_plan'::public.user_capability));
$$;

create or replace function public.v2_annual_revision_access(p_revision_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_profile_is_active() and exists (
    select 1 from public.annual_plan_revisions r join public.annual_plan_cycles c on c.id = r.cycle_id
    where r.id = p_revision_id and ((p_write and r.owner_id = (select auth.uid()) and r.status = 'draft_owner_only') or (not p_write and ((r.status = 'draft_owner_only' and r.owner_id = (select auth.uid())) or (r.status = 'pending_executive' and (r.owner_id = (select auth.uid()) or r.assigned_executive_id = (select auth.uid()))) or (r.status = 'approved' and public.can_use_brand_capability(c.brand_id, 'view_approved_plan'::public.user_capability)) or public.current_user_is_administrator_v2())))
  );
$$;

-- Child rows must inherit the exact revision privacy rule; a bare foreign-key
-- existence check would leak another user's draft lines.
drop policy if exists annual_plan_lines_select_revision_access on public.annual_plan_lines;
drop policy if exists purchase_waves_select_revision_access on public.purchase_waves;
drop policy if exists purchase_wave_revisions_select_revision_access on public.purchase_wave_revisions;
drop policy if exists purchase_wave_allocations_select_revision_access on public.purchase_wave_allocations;
create policy annual_plan_lines_select_revision_access on public.annual_plan_lines for select to authenticated using (public.v2_annual_revision_access(revision_id, false));
create policy purchase_waves_select_revision_access on public.purchase_waves for select to authenticated using (exists (select 1 from public.purchase_wave_revisions wr where wr.wave_id = public.purchase_waves.id and public.v2_annual_revision_access(wr.revision_id, false)));
create policy purchase_wave_revisions_select_revision_access on public.purchase_wave_revisions for select to authenticated using (public.v2_annual_revision_access(revision_id, false));
create policy purchase_wave_allocations_select_revision_access on public.purchase_wave_allocations for select to authenticated using (exists (select 1 from public.purchase_wave_revisions wr where wr.id = wave_revision_id and public.v2_annual_revision_access(wr.revision_id, false)));

create or replace function public.create_or_resume_annual_plan_v2(p_brand_id uuid, p_planning_year integer, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid()); cycle_row public.annual_plan_cycles%rowtype; revision_row public.annual_plan_revisions%rowtype; existing_action public.action_idempotency%rowtype; request_payload jsonb;
begin
  if p_planning_year < extract(year from current_date)::int then raise exception using errcode = 'P0001', message = 'PAST_PLANNING_YEAR'; end if;
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'action_idempotency_key_required'; end if;
  if not public.v2_annual_plan_authorized(p_brand_id) then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_BRAND_ACCESS_REQUIRED'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key); request_payload := jsonb_build_object('brandId', p_brand_id, 'planningYear', p_planning_year);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then if existing_action.action_type <> 'create_or_resume_annual_plan_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if; return existing_action.result -> 'data'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(format('annual-plan:%s:%s', p_brand_id, p_planning_year), 0));
  select * into cycle_row from public.annual_plan_cycles where brand_id = p_brand_id and planning_year = p_planning_year for update;
  if cycle_row.id is null then insert into public.annual_plan_cycles(brand_id, planning_year, created_by) values (p_brand_id, p_planning_year, actor_id) returning * into cycle_row; end if;
  select * into revision_row from public.annual_plan_revisions where cycle_id = cycle_row.id and owner_id = actor_id and status = 'draft_owner_only' order by revision_number desc limit 1 for update;
  if revision_row.id is null then select coalesce(max(revision_number), 0) + 1 into revision_row.revision_number from public.annual_plan_revisions where cycle_id = cycle_row.id; insert into public.annual_plan_revisions(cycle_id, revision_number, owner_id) values (cycle_row.id, revision_row.revision_number, actor_id) returning * into revision_row; end if;
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('cycleId', cycle_row.id, 'revisionId', revision_row.id, 'revisionNumber', revision_row.revision_number, 'planningYear', p_planning_year, 'status', revision_row.status, 'lockVersion', revision_row.lock_version));
  perform public.write_audit_event(p_brand_id, 'annual_plan_created_or_resumed', 'annual_plan_revision', revision_row.id, p_idempotency_key, null, request_payload -> 'data', jsonb_build_object('source', 'v2'));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'create_or_resume_annual_plan_v2', revision_row.id, request_payload, actor_id);
  return request_payload -> 'data';
end; $$;

create or replace function public.save_annual_plan_scope_v2(p_revision_id uuid, p_expected_lock_version integer, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare revision_row public.annual_plan_revisions%rowtype; cycle_brand uuid; actor_id uuid := (select auth.uid()); existing_action public.action_idempotency%rowtype; request_payload jsonb;
begin
  if not public.v2_annual_revision_access(p_revision_id, true) then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DRAFT_FORBIDDEN'; end if;
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'action_idempotency_key_required'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('revisionId', p_revision_id, 'expectedLockVersion', p_expected_lock_version);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'save_annual_plan_scope_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into revision_row from public.annual_plan_revisions where id = p_revision_id for update;
  select c.brand_id into cycle_brand from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  if revision_row.lock_version <> p_expected_lock_version then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT'; end if;
  update public.annual_plan_revisions set lock_version = lock_version + 1, updated_at = now() where id = p_revision_id returning * into revision_row;
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('revisionId', p_revision_id, 'lockVersion', revision_row.lock_version));
  perform public.write_audit_event(cycle_brand, 'annual_plan_scope_saved', 'annual_plan_revision', p_revision_id, p_idempotency_key, null, request_payload -> 'data', '{}'::jsonb);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'save_annual_plan_scope_v2', p_revision_id, request_payload, actor_id);
  return request_payload -> 'data';
end; $$;

create or replace function public.save_annual_plan_lines_v2(p_revision_id uuid, p_expected_lock_version integer, p_lines jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare revision_row public.annual_plan_revisions%rowtype; line_row jsonb; line_product_id uuid; cycle_brand uuid; actor_id uuid := (select auth.uid()); existing_action public.action_idempotency%rowtype; request_payload jsonb;
begin
  if not public.v2_annual_revision_access(p_revision_id, true) then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DRAFT_FORBIDDEN'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LINES_INVALID'; end if;
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'action_idempotency_key_required'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('revisionId', p_revision_id, 'expectedLockVersion', p_expected_lock_version, 'lines', p_lines);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'save_annual_plan_lines_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select r.* into revision_row from public.annual_plan_revisions r where r.id = p_revision_id for update;
  select c.brand_id into cycle_brand from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  if revision_row.lock_version <> p_expected_lock_version then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT'; end if;
  for line_row in select * from jsonb_array_elements(p_lines) loop
    line_product_id := (line_row ->> 'productId')::uuid;
    if not exists (select 1 from public.products p where p.id = line_product_id and p.brand_id = cycle_brand and p.is_active) then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_PRODUCT_FORBIDDEN'; end if;
    if coalesce((line_row ->> 'openingStock')::integer, 0) < 0 or coalesce((line_row ->> 'annualPaidQty')::integer, 0) < 0 or coalesce((line_row ->> 'annualFocQty')::integer, 0) < 0 or coalesce((line_row ->> 'exPrice')::numeric, 0) < 0 then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LINE_NEGATIVE'; end if;
    insert into public.annual_plan_lines(revision_id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price) values (p_revision_id, line_product_id, coalesce((line_row ->> 'openingStock')::integer,0), coalesce((line_row ->> 'annualPaidQty')::integer,0), coalesce((line_row ->> 'annualFocQty')::integer,0), coalesce((line_row ->> 'exPrice')::numeric,0)) on conflict (revision_id, product_id) do update set opening_stock = excluded.opening_stock, annual_paid_qty = excluded.annual_paid_qty, annual_foc_qty = excluded.annual_foc_qty, ex_price = excluded.ex_price, updated_at = now();
  end loop;
  update public.annual_plan_revisions set lock_version = lock_version + 1, updated_at = now() where id = p_revision_id returning * into revision_row;
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('revisionId', p_revision_id, 'lockVersion', revision_row.lock_version, 'lineCount', (select count(*) from public.annual_plan_lines where revision_id = p_revision_id)));
  perform public.write_audit_event(cycle_brand, 'annual_plan_lines_saved', 'annual_plan_revision', p_revision_id, p_idempotency_key, null, request_payload -> 'data', '{}'::jsonb);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'save_annual_plan_lines_v2', p_revision_id, request_payload, actor_id);
  return request_payload -> 'data';
end; $$;

create or replace function public.save_purchase_wave_allocations_v2(p_revision_id uuid, p_expected_lock_version integer, p_waves jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare revision_row public.annual_plan_revisions%rowtype; cycle_row public.annual_plan_cycles%rowtype; annual_line public.annual_plan_lines%rowtype; wave_row jsonb; allocation_row jsonb; current_wave_id uuid; current_wave_revision_id uuid; allocation_product_id uuid; paid_qty integer; foc_qty integer; allocation_price numeric; paid_total bigint; foc_total bigint; actor_id uuid := (select auth.uid()); existing_action public.action_idempotency%rowtype; request_payload jsonb;
begin
  if not public.v2_annual_revision_access(p_revision_id, true) then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DRAFT_FORBIDDEN'; end if;
  if jsonb_typeof(p_waves) <> 'array' then raise exception using errcode = 'P0001', message = 'PURCHASE_WAVES_INVALID'; end if;
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'action_idempotency_key_required'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('revisionId', p_revision_id, 'expectedLockVersion', p_expected_lock_version, 'waves', p_waves);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'save_purchase_wave_allocations_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select r.* into revision_row from public.annual_plan_revisions r where r.id = p_revision_id for update; select c.* into cycle_row from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  if revision_row.lock_version <> p_expected_lock_version then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT'; end if;
  -- The payload is the complete draft snapshot. Remove omitted, non-operational wave revisions
  -- before replacing the submitted rows; stable wave identities remain available for reuse.
  delete from public.purchase_wave_revisions old_wave_revision
  using public.purchase_waves old_wave
  where old_wave.id = old_wave_revision.wave_id
    and old_wave_revision.revision_id = p_revision_id
    and old_wave.status = 'planned'
    and not exists (
      select 1 from jsonb_array_elements(p_waves) incoming
      where ((incoming ->> 'waveId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' and (incoming ->> 'waveId')::uuid = old_wave.id)
         or (nullif(incoming ->> 'waveId', '') is null and (incoming ->> 'waveNumber')::integer = old_wave.wave_number)
    );
  for wave_row in select * from jsonb_array_elements(p_waves) loop
    if ((wave_row ->> 'neededMonth')::date <> date_trunc('month', (wave_row ->> 'neededMonth')::date)::date) or extract(year from (wave_row ->> 'neededMonth')::date) <> cycle_row.planning_year then raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_MONTH_INVALID'; end if;
    if coalesce((wave_row ->> 'waveNumber')::integer, 0) < 1 then raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_SEQUENCE_INVALID'; end if;
    if (wave_row ->> 'waveId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      current_wave_id := (wave_row ->> 'waveId')::uuid;
    else
      current_wave_id := null;
    end if;
    if current_wave_id is null then insert into public.purchase_waves(cycle_id, wave_number, stable_key) values (cycle_row.id, (wave_row ->> 'waveNumber')::integer, format('%s-%s', cycle_row.id, (wave_row ->> 'waveNumber')::integer)) on conflict (cycle_id, wave_number) do update set updated_at = now() returning id into current_wave_id; else if not exists (select 1 from public.purchase_waves where id = current_wave_id and cycle_id = cycle_row.id) then if exists (select 1 from public.purchase_waves where id = current_wave_id) then raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_FORBIDDEN'; end if; current_wave_id := null; insert into public.purchase_waves(cycle_id, wave_number, stable_key) values (cycle_row.id, (wave_row ->> 'waveNumber')::integer, format('%s-%s', cycle_row.id, (wave_row ->> 'waveNumber')::integer)) on conflict (cycle_id, wave_number) do update set updated_at = now() returning id into current_wave_id; end if; end if;
    insert into public.purchase_wave_revisions(wave_id, revision_id, needed_month) values (current_wave_id, p_revision_id, (wave_row ->> 'neededMonth')::date) on conflict (wave_id, revision_id) do update set needed_month = excluded.needed_month, updated_at = now() returning id into current_wave_revision_id;
    delete from public.purchase_wave_allocations allocations where allocations.wave_revision_id = current_wave_revision_id;
    for allocation_row in select * from jsonb_array_elements(coalesce(wave_row -> 'allocations', '[]'::jsonb)) loop
      allocation_product_id := (allocation_row ->> 'productId')::uuid;
      select l.* into annual_line from public.annual_plan_lines l where l.revision_id = p_revision_id and l.product_id = allocation_product_id;
      if annual_line.id is null then raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_PRODUCT_UNKNOWN'; end if;
      paid_qty := coalesce((allocation_row ->> 'paidQty')::integer, 0);
      foc_qty := coalesce((allocation_row ->> 'focQty')::integer, 0);
      allocation_price := coalesce((allocation_row ->> 'exPrice')::numeric, annual_line.ex_price);
      if paid_qty < 0 or foc_qty < 0 or allocation_price < 0 then raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_ALLOCATION_NEGATIVE'; end if;
      if allocation_price <> annual_line.ex_price then raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_EX_PRICE_MISMATCH'; end if;
      insert into public.purchase_wave_allocations(wave_revision_id, product_id, paid_qty, foc_qty, ex_price) values (current_wave_revision_id, allocation_product_id, paid_qty, foc_qty, allocation_price);
    end loop;
  end loop;
  select coalesce(sum(a.paid_qty),0), coalesce(sum(a.foc_qty),0) into paid_total, foc_total from public.purchase_wave_allocations a join public.purchase_wave_revisions wr on wr.id = a.wave_revision_id where wr.revision_id = p_revision_id;
  if exists (
    select 1 from public.annual_plan_lines l
    left join (
      select a.product_id, sum(a.paid_qty)::bigint paid_qty, sum(a.foc_qty)::bigint foc_qty
      from public.purchase_wave_allocations a
      join public.purchase_wave_revisions wr on wr.id = a.wave_revision_id
      where wr.revision_id = p_revision_id
      group by a.product_id
    ) totals on totals.product_id = l.product_id
    where l.revision_id = p_revision_id
      and (coalesce(totals.paid_qty, 0) <> l.annual_paid_qty or coalesce(totals.foc_qty, 0) <> l.annual_foc_qty)
  ) then raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_ALLOCATION_MISMATCH'; end if;
  update public.annual_plan_revisions set lock_version = lock_version + 1, updated_at = now() where id = p_revision_id returning * into revision_row;
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object(
    'revisionId', p_revision_id,
    'lockVersion', revision_row.lock_version,
    'paidQty', paid_total,
    'focQty', foc_total,
    'waves', coalesce((select jsonb_agg(jsonb_build_object(
      'id', w.id,
      'sequence', w.wave_number,
      'neededMonth', to_char(wr.needed_month, 'YYYY-MM'),
      'allocations', coalesce((select jsonb_agg(jsonb_build_object('productId', a.product_id, 'paidQty', a.paid_qty, 'focQty', a.foc_qty, 'exPrice', a.ex_price) order by a.product_id) from public.purchase_wave_allocations a where a.wave_revision_id = wr.id), '[]'::jsonb)
    ) order by w.wave_number) from public.purchase_wave_revisions wr join public.purchase_waves w on w.id = wr.wave_id where wr.revision_id = p_revision_id), '[]'::jsonb)
  ));
  perform public.write_audit_event(cycle_row.brand_id, 'purchase_wave_allocations_saved', 'annual_plan_revision', p_revision_id, p_idempotency_key, null, request_payload -> 'data', '{}'::jsonb);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'save_purchase_wave_allocations_v2', p_revision_id, request_payload, actor_id);
  return request_payload -> 'data';
end; $$;

create or replace function public.create_annual_plan_revision_v2(p_cycle_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); old_revision public.annual_plan_revisions%rowtype; new_revision public.annual_plan_revisions%rowtype; wave public.purchase_waves%rowtype; old_wave_revision public.purchase_wave_revisions%rowtype; new_wave_revision_id uuid; existing_action public.action_idempotency%rowtype; request_payload jsonb; brand_id uuid;
begin
  if not exists (select 1 from public.annual_plan_cycles c where c.id = p_cycle_id and public.v2_annual_plan_authorized(c.brand_id)) then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_BRAND_ACCESS_REQUIRED'; end if;
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'action_idempotency_key_required'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key); request_payload := jsonb_build_object('cycleId', p_cycle_id);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then if existing_action.action_type <> 'create_annual_plan_revision_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if; return existing_action.result -> 'data'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(('annual-plan-revision:' || p_cycle_id::text), 0));
  select c.brand_id into brand_id from public.annual_plan_cycles c where c.id = p_cycle_id;
  select * into old_revision from public.annual_plan_revisions where cycle_id = p_cycle_id and status = 'approved' order by revision_number desc limit 1;
  if old_revision.id is null then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_SOURCE_NOT_APPROVED'; end if;
  insert into public.annual_plan_revisions(cycle_id, revision_number, owner_id) select p_cycle_id, coalesce(max(revision_number),0)+1, actor_id from public.annual_plan_revisions where cycle_id = p_cycle_id returning * into new_revision;
  insert into public.annual_plan_lines(revision_id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price) select new_revision.id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price from public.annual_plan_lines where revision_id = old_revision.id;
  for wave in select * from public.purchase_waves where cycle_id = p_cycle_id loop
    for old_wave_revision in select * from public.purchase_wave_revisions where wave_id = wave.id and revision_id = old_revision.id loop
      insert into public.purchase_wave_revisions(wave_id, revision_id, needed_month) values (wave.id, new_revision.id, old_wave_revision.needed_month) returning id into new_wave_revision_id;
      insert into public.purchase_wave_allocations(wave_revision_id, product_id, paid_qty, foc_qty, ex_price) select new_wave_revision_id, product_id, paid_qty, foc_qty, ex_price from public.purchase_wave_allocations where wave_revision_id = old_wave_revision.id;
    end loop;
  end loop;
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('cycleId', p_cycle_id, 'revisionId', new_revision.id, 'revisionNumber', new_revision.revision_number, 'status', new_revision.status));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'create_annual_plan_revision_v2', new_revision.id, request_payload, actor_id);
  perform public.write_audit_event(brand_id, 'annual_plan_revision_created', 'annual_plan_revision', new_revision.id, p_idempotency_key, null, request_payload -> 'data', '{}'::jsonb);
  return request_payload -> 'data';
end; $$;

revoke all on function public.v2_annual_plan_authorized(uuid), public.v2_annual_revision_access(uuid, boolean), public.create_or_resume_annual_plan_v2(uuid, integer, uuid), public.save_annual_plan_scope_v2(uuid, integer, uuid), public.save_annual_plan_lines_v2(uuid, integer, jsonb, uuid), public.save_purchase_wave_allocations_v2(uuid, integer, jsonb, uuid), public.create_annual_plan_revision_v2(uuid, uuid) from public, anon;
grant execute on function public.create_or_resume_annual_plan_v2(uuid, integer, uuid), public.save_annual_plan_scope_v2(uuid, integer, uuid), public.save_annual_plan_lines_v2(uuid, integer, jsonb, uuid), public.save_purchase_wave_allocations_v2(uuid, integer, jsonb, uuid), public.create_annual_plan_revision_v2(uuid, uuid) to authenticated, service_role;
