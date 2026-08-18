-- V2 dashboard projections and purchase-wave operational commands.
-- Every view is security-invoker: the underlying V2 RLS policies remain the
-- final privacy boundary. No legacy planning_* or report tables are used.

begin;

alter table public.purchase_waves
  add column if not exists official_po_number text,
  add column if not exists ordered_at date,
  add column if not exists supplier_confirmed_at date,
  add column if not exists received_at date,
  add column if not exists cancelled_at timestamptz;

alter table public.purchase_waves
  drop constraint if exists purchase_waves_official_po_number_check,
  drop constraint if exists purchase_waves_operational_dates_check;

alter table public.purchase_waves
  add constraint purchase_waves_official_po_number_check
    check (official_po_number is null or length(btrim(official_po_number)) between 1 and 80),
  add constraint purchase_waves_operational_dates_check
    check (
      (ordered_at is null or ordered_at >= date '2000-01-01')
      and (supplier_confirmed_at is null or supplier_confirmed_at >= date '2000-01-01')
      and (received_at is null or received_at >= date '2000-01-01')
      and (supplier_confirmed_at is null or ordered_at is null or supplier_confirmed_at >= ordered_at)
      and (received_at is null or supplier_confirmed_at is null or received_at >= supplier_confirmed_at)
    );

create index if not exists purchase_waves_status_cycle_idx
  on public.purchase_waves(cycle_id, status, wave_number);
create index if not exists purchase_wave_revisions_operational_month_idx
  on public.purchase_wave_revisions(revision_id, order_month, arrival_month);
create index if not exists purchase_proposals_dashboard_scope_idx
  on public.purchase_proposals(brand_id, planning_year, status, updated_at desc);

create or replace view public.v2_dashboard_approved_plan_lines
with (security_invoker = true, security_barrier = true)
as
with allocated as (
  select
    wr.revision_id,
    a.product_id,
    coalesce(sum(a.paid_qty), 0)::bigint as allocated_paid_qty,
    coalesce(sum(a.foc_qty), 0)::bigint as allocated_foc_qty,
    coalesce(sum(a.amount), 0)::numeric(20, 2) as allocated_amount
  from public.purchase_wave_revisions wr
  join public.purchase_waves w on w.id = wr.wave_id and w.status <> 'cancelled'
  join public.purchase_wave_allocations a on a.wave_revision_id = wr.id
  group by wr.revision_id, a.product_id
)
select
  c.brand_id,
  b.code as brand_code,
  b.name as brand_name,
  c.planning_year,
  c.currency_code,
  r.id as revision_id,
  r.revision_number,
  r.status::text as revision_status,
  l.product_id,
  p.canonical_sku as sku,
  p.name as product_name,
  l.opening_stock,
  l.annual_paid_qty,
  l.annual_foc_qty,
  l.ex_price,
  l.amount as baseline_amount,
  coalesce(a.allocated_paid_qty, 0) as allocated_paid_qty,
  coalesce(a.allocated_foc_qty, 0) as allocated_foc_qty,
  coalesce(a.allocated_amount, 0)::numeric(20, 2) as allocated_amount
from public.annual_plan_cycles c
join public.brands b on b.id = c.brand_id
join public.annual_plan_revisions r on r.cycle_id = c.id and r.status = 'approved'
join public.annual_plan_lines l on l.revision_id = r.id
join public.products p on p.id = l.product_id
left join allocated a on a.revision_id = r.id and a.product_id = l.product_id
where b.is_active;

create or replace view public.v2_dashboard_purchase_waves
with (security_invoker = true, security_barrier = true)
as
with wave_totals as (
  select
    wr.revision_id,
    wr.wave_id,
    wr.order_month,
    wr.arrival_month,
    coalesce(sum(a.paid_qty + a.foc_qty), 0)::bigint as planned_units,
    coalesce(sum(a.amount), 0)::numeric(20, 2) as amount
  from public.purchase_wave_revisions wr
  join public.purchase_wave_allocations a on a.wave_revision_id = wr.id
  group by wr.revision_id, wr.wave_id, wr.order_month, wr.arrival_month
), reservation_totals as (
  select
    cr.wave_id,
    coalesce(sum(cr.reserved_qty) filter (where cr.status in ('held', 'consumed')), 0)::bigint as used_units
  from public.capacity_reservations cr
  group by cr.wave_id
)
select
  c.brand_id,
  b.code as brand_code,
  b.name as brand_name,
  c.planning_year,
  c.currency_code,
  r.id as revision_id,
  r.revision_number,
  r.status::text as revision_status,
  w.id as wave_id,
  w.wave_number,
  w.status::text as status,
  wt.order_month,
  wt.arrival_month,
  w.official_po_number,
  w.ordered_at,
  w.supplier_confirmed_at,
  w.received_at,
  wt.planned_units,
  coalesce(rt.used_units, 0) as used_units,
  wt.amount
from public.annual_plan_cycles c
join public.brands b on b.id = c.brand_id
join public.annual_plan_revisions r on r.cycle_id = c.id and r.status = 'approved'
join public.purchase_waves w on w.cycle_id = c.id
join wave_totals wt on wt.revision_id = r.id and wt.wave_id = w.id
left join reservation_totals rt on rt.wave_id = w.id
where b.is_active;

create or replace view public.v2_dashboard_proposal_activity
with (security_invoker = true, security_barrier = true)
as
with latest_revision as (
  select distinct on (proposal_id) id, proposal_id
  from public.proposal_revisions
  order by proposal_id, revision_number desc
), activity as (
  select
    p.id as proposal_id,
    p.brand_id,
    p.planning_year,
    p.status,
    p.owner_id,
    p.assigned_manager_id,
    p.assigned_executive_id,
    p.needed_month,
    p.route_reason,
    p.updated_at,
    coalesce(sum(prs.requested_qty), 0)::bigint as requested_units,
    coalesce(sum(prs.reference_amount), 0)::numeric(20, 2) as reference_amount,
    bool_or(prs.over_plan) as over_plan
  from public.purchase_proposals p
  left join latest_revision lr on lr.proposal_id = p.id
  left join public.proposal_route_snapshots prs on prs.proposal_revision_id = lr.id
  group by p.id, p.brand_id, p.planning_year, p.status, p.owner_id,
    p.assigned_manager_id, p.assigned_executive_id, p.needed_month,
    p.route_reason, p.updated_at
)
select
  proposal_id,
  brand_id,
  planning_year,
  status,
  owner_id,
  assigned_manager_id,
  assigned_executive_id,
  needed_month,
  requested_units,
  reference_amount,
  coalesce(over_plan, false) as over_plan,
  route_reason,
  updated_at
from activity;

create or replace view public.v2_dashboard_governance_signals
with (security_invoker = true, security_barrier = true)
as
select
  coalesce((
    select count(*)::bigint
    from public.profiles p
    where public.current_user_is_administrator_v2()
      and p.is_active
      and p.org_tier in ('leader'::public.org_tier, 'manager'::public.org_tier)
      and not exists (select 1 from public.reporting_lines rl where rl.user_id = p.id)
  ), 0)::bigint as active_users_without_supervisor,
  coalesce((
    select count(*)::bigint
    from public.brands b
    where public.current_user_is_administrator_v2()
      and b.is_active
      and not exists (
        select 1
        from public.proposal_approval_policy_brands pb
        join public.proposal_approval_policies policy on policy.id = pb.policy_id
        where pb.brand_id = b.id and pb.is_active and policy.is_active
          and pb.effective_from <= current_date
          and (pb.effective_to is null or pb.effective_to >= current_date)
      )
  ), 0)::bigint as brands_without_active_policy,
  coalesce((
    select count(*)::bigint
    from public.notification_outbox o
    where public.current_user_is_administrator_v2() and o.status = 'pending'
  ), 0)::bigint as pending_notification_outbox;

comment on view public.v2_dashboard_approved_plan_lines is
  'Approved-only, RLS-respecting baseline lines for the V2 dashboard. Amount is database-generated Qty × Ex Price.';
comment on view public.v2_dashboard_purchase_waves is
  'Approved-plan wave progress with canonical order/arrival months and actual operational fields.';
comment on view public.v2_dashboard_proposal_activity is
  'Role-scoped proposal activity; drafts remain visible only through the proposal owner RLS policy.';

create or replace function public.operate_purchase_wave_v2(
  p_wave_id uuid,
  p_next_status text,
  p_official_po_number text,
  p_ordered_at date,
  p_supplier_confirmed_at date,
  p_received_at date,
  p_reassignments jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_tier public.org_tier;
  wave_row public.purchase_waves%rowtype;
  cycle_row public.annual_plan_cycles%rowtype;
  revision_id uuid;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
  active_proposal record;
  candidate_wave_id uuid;
  replacement_revision_id uuid;
  reservation_row record;
  previous_status text;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'PURCHASE_WAVE_OPERATION_FORBIDDEN';
  end if;
  select p.org_tier into actor_tier from public.profiles p where p.id = actor_id;
  if actor_tier not in ('manager'::public.org_tier, 'executive'::public.org_tier)
     and not public.current_user_is_administrator_v2() then
    raise exception using errcode = '42501', message = 'PURCHASE_WAVE_OPERATION_FORBIDDEN';
  end if;
  if p_next_status not in ('ordered', 'supplier_confirmed', 'received', 'cancelled')
     or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_OPERATION_INVALID';
  end if;

  request_payload := jsonb_build_object(
    'waveId', p_wave_id,
    'nextStatus', p_next_status,
    'officialPoNumber', nullif(btrim(coalesce(p_official_po_number, '')), ''),
    'orderedAt', p_ordered_at,
    'supplierConfirmedAt', p_supplier_confirmed_at,
    'receivedAt', p_received_at,
    'reassignments', coalesce(p_reassignments, '[]'::jsonb)
  );
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'operate_purchase_wave_v2'
       or existing_action.created_by <> actor_id
       or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;

  select * into wave_row from public.purchase_waves where id = p_wave_id for update;
  select * into cycle_row from public.annual_plan_cycles where id = wave_row.cycle_id;
  select r.id into revision_id
  from public.purchase_wave_revisions wr
  join public.annual_plan_revisions r on r.id = wr.revision_id and r.status = 'approved'
  where wr.wave_id = p_wave_id
  order by r.revision_number desc limit 1;
  if wave_row.id is null or cycle_row.id is null or revision_id is null
     or (not public.current_user_is_administrator_v2()
         and not public.can_use_brand_capability(cycle_row.brand_id, 'view_approved_plan'::public.user_capability)) then
    raise exception using errcode = '42501', message = 'PURCHASE_WAVE_OPERATION_FORBIDDEN';
  end if;
  previous_status := wave_row.status::text;
  if p_next_status = 'ordered' then
    if previous_status <> 'planned' or nullif(btrim(coalesce(p_official_po_number, '')), '') is null or p_ordered_at is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_ORDER_DATA_REQUIRED';
    end if;
  elsif p_next_status = 'supplier_confirmed' then
    if previous_status <> 'ordered' or p_supplier_confirmed_at is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_CONFIRMATION_DATA_REQUIRED';
    end if;
  elsif p_next_status = 'received' then
    if previous_status <> 'supplier_confirmed' or p_received_at is null then
      raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_RECEIPT_DATA_REQUIRED';
    end if;
  elsif p_next_status = 'cancelled' then
    if previous_status in ('received', 'cancelled') then
      raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_CANCELLATION_INVALID';
    end if;
    if jsonb_typeof(coalesce(p_reassignments, '[]'::jsonb)) <> 'array' then
      raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_REASSIGNMENTS_INVALID';
    end if;
    for active_proposal in
      select distinct p.id as proposal_id
      from public.capacity_reservations cr
      join public.proposal_revisions pr on pr.id = cr.proposal_revision_id
      join public.purchase_proposals p on p.id = pr.proposal_id
      where cr.wave_id = p_wave_id
        and cr.status in ('held'::public.proposal_capacity_status, 'consumed'::public.proposal_capacity_status)
        and p.status not in ('cancelled', 'rejected', 'withdrawn')
    loop
      candidate_wave_id := null;
      begin
        candidate_wave_id := (
          select (entry ->> 'replacementWaveId')::uuid
          from jsonb_array_elements(coalesce(p_reassignments, '[]'::jsonb)) entry
          where (entry ->> 'proposalId')::uuid = active_proposal.proposal_id
          limit 1
        );
      exception when invalid_text_representation then
        candidate_wave_id := null;
      end;
      if candidate_wave_id is null then
        raise exception using errcode = 'P0001', message = 'ACTIVE_PROPOSAL_REASSIGNMENT_REQUIRED';
      end if;
      select w.id into candidate_wave_id
      from public.purchase_waves w
      where w.id = candidate_wave_id and w.cycle_id = cycle_row.id and w.id <> p_wave_id and w.status <> 'cancelled'
      for update;
      if candidate_wave_id is null then
        raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_REPLACEMENT_INVALID';
      end if;
      select wr.id into replacement_revision_id
      from public.purchase_wave_revisions wr
      where wr.wave_id = candidate_wave_id and wr.revision_id = revision_id;
      if replacement_revision_id is null then
        raise exception using errcode = 'P0001', message = 'PURCHASE_WAVE_REPLACEMENT_INVALID';
      end if;
      for reservation_row in
        select * from public.capacity_reservations
        where wave_id = p_wave_id
          and proposal_revision_id in (select id from public.proposal_revisions where proposal_id = active_proposal.proposal_id)
          and status in ('held'::public.proposal_capacity_status, 'consumed'::public.proposal_capacity_status)
        for update
      loop
        if exists (
          select 1 from public.capacity_reservations cr
          where cr.proposal_revision_id = reservation_row.proposal_revision_id
            and cr.wave_id = candidate_wave_id
            and cr.product_id = reservation_row.product_id
        ) then
          update public.capacity_reservations
          set reserved_qty = reserved_qty + reservation_row.reserved_qty,
              status = reservation_row.status,
              released_at = null
          where proposal_revision_id = reservation_row.proposal_revision_id
            and wave_id = candidate_wave_id
            and product_id = reservation_row.product_id;
        else
          insert into public.capacity_reservations(proposal_revision_id, wave_id, product_id, reserved_qty, status)
          values (reservation_row.proposal_revision_id, candidate_wave_id, reservation_row.product_id, reservation_row.reserved_qty, reservation_row.status);
        end if;
        update public.capacity_reservations
        set status = 'released'::public.proposal_capacity_status, released_at = now()
        where id = reservation_row.id;
        update public.proposal_route_snapshots
        set selected_wave_id = candidate_wave_id
        where proposal_revision_id = reservation_row.proposal_revision_id
          and product_id = reservation_row.product_id;
      end loop;
    end loop;
  end if;

  update public.purchase_waves
  set status = p_next_status::public.purchase_wave_status,
      official_po_number = coalesce(nullif(btrim(p_official_po_number), ''), official_po_number),
      ordered_at = coalesce(p_ordered_at, ordered_at),
      supplier_confirmed_at = coalesce(p_supplier_confirmed_at, supplier_confirmed_at),
      received_at = coalesce(p_received_at, received_at),
      cancelled_at = case when p_next_status = 'cancelled' then now() else cancelled_at end,
      updated_at = now()
  where id = p_wave_id
  returning * into wave_row;
  result_payload := jsonb_build_object(
    'waveId', p_wave_id,
    'previousStatus', previous_status,
    'status', wave_row.status,
    'officialPoNumber', wave_row.official_po_number,
    'orderedAt', wave_row.ordered_at,
    'supplierConfirmedAt', wave_row.supplier_confirmed_at,
    'receivedAt', wave_row.received_at
  );
  perform public.write_audit_event(
    cycle_row.brand_id,
    'purchase_wave_operated',
    'purchase_wave',
    p_wave_id,
    p_idempotency_key,
    jsonb_build_object('status', previous_status),
    result_payload,
    jsonb_build_object('source', 'v2', 'reassignments', coalesce(p_reassignments, '[]'::jsonb))
  );
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by)
  values (p_idempotency_key, 'operate_purchase_wave_v2', p_wave_id, jsonb_build_object('request', request_payload, 'data', result_payload), actor_id);
  return result_payload;
end;
$$;

revoke all on function public.operate_purchase_wave_v2(uuid, text, text, date, date, date, jsonb, uuid) from public, anon;
grant execute on function public.operate_purchase_wave_v2(uuid, text, text, date, date, date, jsonb, uuid) to authenticated, service_role;
grant select on public.v2_dashboard_approved_plan_lines, public.v2_dashboard_purchase_waves, public.v2_dashboard_proposal_activity, public.v2_dashboard_governance_signals to authenticated;

commit;
