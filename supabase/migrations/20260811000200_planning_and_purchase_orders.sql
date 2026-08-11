create type public.plan_status as enum (
  'draft',
  'submitted',
  'review_l1',
  'review_l2',
  'approved',
  'changes_requested',
  'superseded'
);

create type public.purchase_batch_status as enum (
  'planned',
  'submitted',
  'confirmed',
  'received',
  'cancelled'
);

create table public.planning_cycles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  code text not null unique check (code = upper(btrim(code)) and code <> ''),
  name text not null check (btrim(name) <> ''),
  planning_year integer not null check (planning_year between 2000 and 2200),
  target_purchase_amount numeric(20, 2) not null default 0
    check (target_purchase_amount >= 0),
  currency_code text not null default 'EUR'
    check (currency_code = upper(currency_code) and length(currency_code) = 3),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, planning_year)
);

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  planning_cycle_id uuid not null references public.planning_cycles(id),
  version_number integer not null check (version_number > 0),
  parent_version_id uuid references public.plan_versions(id),
  source_snapshot_id uuid,
  status public.plan_status not null default 'draft',
  lock_version integer not null default 0 check (lock_version >= 0),
  submitted_at timestamptz,
  approved_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planning_cycle_id, version_number),
  check (parent_version_id is null or parent_version_id <> id)
);

create table public.plan_lines (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.plan_versions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  opening_stock integer not null default 0,
  target_stock integer not null default 0 check (target_stock >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_version_id, product_id)
);

create table public.plan_monthly_demand (
  id uuid primary key default gen_random_uuid(),
  plan_line_id uuid not null references public.plan_lines(id) on delete cascade,
  demand_month date not null check (demand_month = date_trunc('month', demand_month)::date),
  demand_qty integer not null check (demand_qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_line_id, demand_month)
);

create table public.purchase_batches (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.plan_versions(id) on delete cascade,
  batch_number integer not null check (batch_number > 0),
  name text not null check (btrim(name) <> ''),
  order_date date not null,
  eta_date date not null check (eta_date >= order_date),
  status public.purchase_batch_status not null default 'planned',
  currency_code text not null default 'EUR'
    check (currency_code = upper(currency_code) and length(currency_code) = 3),
  supplier_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_version_id, batch_number)
);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_batch_id uuid not null references public.purchase_batches(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty integer not null check (qty >= 0),
  foc_qty integer not null default 0 check (foc_qty >= 0),
  ex_price numeric(18, 6) not null check (ex_price >= 0),
  amount numeric(20, 2)
    generated always as (round(qty::numeric * ex_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_batch_id, product_id)
);

create index planning_cycles_brand_id_idx
  on public.planning_cycles (brand_id);
create index plan_versions_cycle_status_idx
  on public.plan_versions (planning_cycle_id, status);
create index plan_versions_parent_version_id_idx
  on public.plan_versions (parent_version_id);
create index plan_lines_version_product_idx
  on public.plan_lines (plan_version_id, product_id);
create index plan_monthly_demand_line_month_idx
  on public.plan_monthly_demand (plan_line_id, demand_month);
create index purchase_batches_version_eta_idx
  on public.purchase_batches (plan_version_id, eta_date);
create index purchase_batches_status_idx
  on public.purchase_batches (status);
create index purchase_lines_batch_product_idx
  on public.purchase_lines (purchase_batch_id, product_id);

create function public.can_plan_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_brand(p_brand_id)
    and (
      public.current_user_has_role('administrator'::public.app_role)
      or public.current_user_has_role('planner'::public.app_role)
    );
$$;

create function public.plan_version_brand_id(p_plan_version_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select planning_cycles.brand_id
  from public.plan_versions
  join public.planning_cycles
    on planning_cycles.id = plan_versions.planning_cycle_id
  where plan_versions.id = p_plan_version_id;
$$;

create function public.can_access_plan_version(p_plan_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_brand(
    public.plan_version_brand_id(p_plan_version_id)
  );
$$;

create function public.can_edit_plan_version(p_plan_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plan_versions
    where id = p_plan_version_id
      and status = 'draft'
      and public.can_plan_brand(
        public.plan_version_brand_id(p_plan_version_id)
      )
  );
$$;

revoke all on function public.can_plan_brand(uuid) from public, anon;
revoke all on function public.plan_version_brand_id(uuid) from public, anon;
revoke all on function public.can_access_plan_version(uuid) from public, anon;
revoke all on function public.can_edit_plan_version(uuid) from public, anon;

grant execute on function public.can_plan_brand(uuid) to authenticated;
grant execute on function public.plan_version_brand_id(uuid) to authenticated;
grant execute on function public.can_access_plan_version(uuid) to authenticated;
grant execute on function public.can_edit_plan_version(uuid) to authenticated;

create function public.guard_plan_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mutation_allowed boolean :=
    coalesce(current_setting('app.allow_plan_version_mutation', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and not mutation_allowed then
      if old.status = 'approved' then
        raise exception using
          errcode = 'P0001',
          message = 'approved_plan_is_immutable';
      end if;

      raise exception using
        errcode = 'P0001',
        message = old.status::text || '_plan_is_immutable';
    end if;

    return old;
  end if;

  if not mutation_allowed then
    if old.status <> 'draft' then
      if old.status = 'approved' then
        raise exception using
          errcode = 'P0001',
          message = 'approved_plan_is_immutable';
      end if;

      raise exception using
        errcode = 'P0001',
        message = old.status::text || '_plan_is_immutable';
    end if;

    if new.status <> old.status then
      raise exception using
        errcode = 'P0001',
        message = 'plan_status_transition_requires_rpc';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger plan_versions_guard_update
before update on public.plan_versions
for each row execute function public.guard_plan_version_mutation();

create trigger plan_versions_guard_delete
before delete on public.plan_versions
for each row execute function public.guard_plan_version_mutation();

create function public.guard_plan_snapshot_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mutation_allowed boolean :=
    coalesce(current_setting('app.allow_plan_version_mutation', true), '') = 'on';
  target_id uuid;
  target_status public.plan_status;
begin
  if mutation_allowed then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_table_name = 'plan_lines' then
    target_id := case when tg_op = 'DELETE' then old.plan_version_id else new.plan_version_id end;
  elsif tg_table_name = 'plan_monthly_demand' then
    select plan_version_id into target_id
    from public.plan_lines
    where id = case when tg_op = 'DELETE' then old.plan_line_id else new.plan_line_id end;
  elsif tg_table_name = 'purchase_batches' then
    target_id := case when tg_op = 'DELETE' then old.plan_version_id else new.plan_version_id end;
  elsif tg_table_name = 'purchase_lines' then
    select plan_version_id into target_id
    from public.purchase_batches
    where id = case when tg_op = 'DELETE' then old.purchase_batch_id else new.purchase_batch_id end;
  end if;

  select status into target_status
  from public.plan_versions
  where id = target_id;

  if target_status <> 'draft' then
    raise exception using
      errcode = 'P0001',
      message = 'plan_snapshot_is_immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger plan_lines_guard_mutation
before insert or update or delete on public.plan_lines
for each row execute function public.guard_plan_snapshot_child_mutation();

create trigger plan_monthly_demand_guard_mutation
before insert or update or delete on public.plan_monthly_demand
for each row execute function public.guard_plan_snapshot_child_mutation();

create trigger purchase_batches_guard_mutation
before insert or update or delete on public.purchase_batches
for each row execute function public.guard_plan_snapshot_child_mutation();

create trigger purchase_lines_guard_mutation
before insert or update or delete on public.purchase_lines
for each row execute function public.guard_plan_snapshot_child_mutation();

revoke all on function public.guard_plan_version_mutation() from public, anon, authenticated;
revoke all on function public.guard_plan_snapshot_child_mutation() from public, anon, authenticated;

alter table public.planning_cycles enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_lines enable row level security;
alter table public.plan_monthly_demand enable row level security;
alter table public.purchase_batches enable row level security;
alter table public.purchase_lines enable row level security;

create policy planning_cycles_select_by_access
on public.planning_cycles
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy planning_cycles_manage_by_access
on public.planning_cycles
for all
to authenticated
using (public.can_plan_brand(brand_id))
with check (public.can_plan_brand(brand_id));

create policy plan_versions_select_by_access
on public.plan_versions
for select
to authenticated
using (public.can_access_plan_version(id));

create policy plan_versions_manage_draft
on public.plan_versions
for all
to authenticated
using (public.can_edit_plan_version(id))
with check (
  status = 'draft'
  and public.can_plan_brand(
    (
      select brand_id
      from public.planning_cycles
      where id = planning_cycle_id
    )
  )
);

create policy plan_lines_select_by_access
on public.plan_lines
for select
to authenticated
using (public.can_access_plan_version(plan_version_id));

create policy plan_lines_manage_draft
on public.plan_lines
for all
to authenticated
using (public.can_edit_plan_version(plan_version_id))
with check (public.can_edit_plan_version(plan_version_id));

create policy plan_monthly_demand_select_by_access
on public.plan_monthly_demand
for select
to authenticated
using (
  public.can_access_plan_version(
    (select plan_version_id from public.plan_lines where id = plan_line_id)
  )
);

create policy plan_monthly_demand_manage_draft
on public.plan_monthly_demand
for all
to authenticated
using (
  public.can_edit_plan_version(
    (select plan_version_id from public.plan_lines where id = plan_line_id)
  )
)
with check (
  public.can_edit_plan_version(
    (select plan_version_id from public.plan_lines where id = plan_line_id)
  )
);

create policy purchase_batches_select_by_access
on public.purchase_batches
for select
to authenticated
using (public.can_access_plan_version(plan_version_id));

create policy purchase_batches_manage_draft
on public.purchase_batches
for all
to authenticated
using (public.can_edit_plan_version(plan_version_id))
with check (public.can_edit_plan_version(plan_version_id));

create policy purchase_lines_select_by_access
on public.purchase_lines
for select
to authenticated
using (
  public.can_access_plan_version(
    (select plan_version_id from public.purchase_batches where id = purchase_batch_id)
  )
);

create policy purchase_lines_manage_draft
on public.purchase_lines
for all
to authenticated
using (
  public.can_edit_plan_version(
    (select plan_version_id from public.purchase_batches where id = purchase_batch_id)
  )
)
with check (
  public.can_edit_plan_version(
    (select plan_version_id from public.purchase_batches where id = purchase_batch_id)
  )
);

revoke all on table public.planning_cycles from anon, authenticated;
revoke all on table public.plan_versions from anon, authenticated;
revoke all on table public.plan_lines from anon, authenticated;
revoke all on table public.plan_monthly_demand from anon, authenticated;
revoke all on table public.purchase_batches from anon, authenticated;
revoke all on table public.purchase_lines from anon, authenticated;

grant select, insert, update, delete on table public.planning_cycles to authenticated;
grant select, insert, update, delete on table public.plan_versions to authenticated;
grant select, insert, update, delete on table public.plan_lines to authenticated;
grant select, insert, update, delete on table public.plan_monthly_demand to authenticated;
grant select, insert, update, delete on table public.purchase_batches to authenticated;
grant select, insert, update, delete on table public.purchase_lines to authenticated;

grant all on table public.planning_cycles to service_role;
grant all on table public.plan_versions to service_role;
grant all on table public.plan_lines to service_role;
grant all on table public.plan_monthly_demand to service_role;
grant all on table public.purchase_batches to service_role;
grant all on table public.purchase_lines to service_role;

grant usage on type public.plan_status to authenticated, service_role;
grant usage on type public.purchase_batch_status to authenticated, service_role;

comment on column public.purchase_lines.amount is
  'Generated invariant: Amount = Qty × Ex Price. FOC is excluded.';
comment on column public.plan_versions.source_snapshot_id is
  'Source snapshot linkage; foreign key is added by the import-pipeline migration.';
