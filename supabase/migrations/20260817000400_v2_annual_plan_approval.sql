-- Annual-plan V2 approval workflow.
-- The tables are intentionally generic so proposal approval can reuse the same
-- immutable case/step/decision primitives in a later migration.

create table if not exists public.workflow_approval_cases (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('annual_plan', 'purchase_proposal', 'proposal_cancellation')),
  target_id uuid not null,
  cycle_id uuid references public.annual_plan_cycles(id),
  brand_id uuid not null references public.brands(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'rejected', 'withdrawn')),
  submitted_by uuid not null references public.profiles(id),
  assigned_executive_id uuid references public.profiles(id),
  route_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(route_snapshot) = 'object'),
  submit_idempotency_key uuid not null unique,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_approval_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.workflow_approval_cases(id) on delete cascade,
  step_order smallint not null check (step_order > 0),
  step_kind text not null check (step_kind in ('executive', 'manager')),
  assignee_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'rejected')),
  acted_by uuid references public.profiles(id),
  acted_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, step_order),
  check ((status = 'pending' and acted_by is null and acted_at is null) or (status <> 'pending' and acted_by is not null and acted_at is not null))
);

create table if not exists public.workflow_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.workflow_approval_cases(id),
  step_id uuid not null references public.workflow_approval_steps(id),
  decision text not null check (decision in ('approve', 'request_changes', 'reject')),
  comment text not null default '',
  decided_by uuid not null references public.profiles(id),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create index if not exists workflow_approval_cases_target_idx on public.workflow_approval_cases(target_kind, target_id, submitted_at desc);
create unique index if not exists workflow_approval_cases_one_pending_idx on public.workflow_approval_cases(target_kind, target_id) where status = 'pending';
create index if not exists workflow_approval_cases_assignee_idx on public.workflow_approval_cases(assigned_executive_id, status);
create index if not exists workflow_approval_steps_assignee_idx on public.workflow_approval_steps(assignee_id, status);
create index if not exists workflow_approval_decisions_case_idx on public.workflow_approval_decisions(case_id, created_at desc);

alter table public.workflow_approval_cases enable row level security;
alter table public.workflow_approval_steps enable row level security;
alter table public.workflow_approval_decisions enable row level security;

drop policy if exists workflow_approval_cases_select_assigned on public.workflow_approval_cases;
drop policy if exists workflow_approval_steps_select_assigned on public.workflow_approval_steps;
drop policy if exists workflow_approval_decisions_select_assigned on public.workflow_approval_decisions;

create policy workflow_approval_cases_select_assigned on public.workflow_approval_cases
for select to authenticated using (
  public.current_profile_is_active()
  and (
    submitted_by = (select auth.uid())
    or assigned_executive_id = (select auth.uid())
    or public.current_user_is_administrator_v2()
    or (status = 'approved' and public.can_use_brand_capability(brand_id, 'view_approved_plan'::public.user_capability))
  )
);

create policy workflow_approval_steps_select_assigned on public.workflow_approval_steps
for select to authenticated using (
  public.current_profile_is_active()
  and exists (select 1 from public.workflow_approval_cases c where c.id = case_id and (
    c.submitted_by = (select auth.uid())
    or c.assigned_executive_id = (select auth.uid())
    or public.current_user_is_administrator_v2()
    or (c.status = 'approved' and public.can_use_brand_capability(c.brand_id, 'view_approved_plan'::public.user_capability))
  ))
);

create policy workflow_approval_decisions_select_assigned on public.workflow_approval_decisions
for select to authenticated using (
  public.current_profile_is_active()
  and exists (select 1 from public.workflow_approval_cases c where c.id = case_id and (
    c.submitted_by = (select auth.uid())
    or c.assigned_executive_id = (select auth.uid())
    or public.current_user_is_administrator_v2()
    or (c.status = 'approved' and public.can_use_brand_capability(c.brand_id, 'view_approved_plan'::public.user_capability))
  ))
);

revoke all on table public.workflow_approval_cases, public.workflow_approval_steps, public.workflow_approval_decisions from anon;
grant select on table public.workflow_approval_cases, public.workflow_approval_steps, public.workflow_approval_decisions to authenticated;

create or replace function public.guard_workflow_approval_decisions_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'workflow_decisions_append_only';
end;
$$;

drop trigger if exists workflow_approval_decisions_append_only_guard on public.workflow_approval_decisions;
create trigger workflow_approval_decisions_append_only_guard
before update or delete on public.workflow_approval_decisions
for each row execute function public.guard_workflow_approval_decisions_append_only();

-- A change request leaves an immutable historical revision and creates a new
-- owner-private draft. Only draft and pending workflows are mutually exclusive;
-- the historical changes_requested row must coexist with its replacement draft.
drop index if exists public.annual_plan_one_active_workflow_idx;
create unique index if not exists annual_plan_one_active_workflow_idx
  on public.annual_plan_revisions (cycle_id)
  where status in ('draft_owner_only', 'pending_executive');

drop policy if exists annual_plan_cycles_select_scoped on public.annual_plan_cycles;
create policy annual_plan_cycles_select_scoped on public.annual_plan_cycles for select to authenticated using (
  public.current_profile_is_active() and (
    exists (select 1 from public.annual_plan_revisions r where r.cycle_id = public.annual_plan_cycles.id and r.owner_id = (select auth.uid()))
    or public.current_user_is_administrator_v2()
    or public.can_use_brand_capability(brand_id, 'view_approved_plan'::public.user_capability)
  )
);

drop policy if exists annual_plan_revisions_select_owner_or_approval on public.annual_plan_revisions;
create policy annual_plan_revisions_select_owner_or_approval on public.annual_plan_revisions for select to authenticated using (
  public.current_profile_is_active() and (
    owner_id = (select auth.uid())
    or (status = 'pending_executive' and assigned_executive_id = (select auth.uid()))
    or (status = 'approved' and exists (select 1 from public.annual_plan_cycles c where c.id = cycle_id and public.can_use_brand_capability(c.brand_id, 'view_approved_plan'::public.user_capability)))
    or public.current_user_is_administrator_v2()
  )
);

create or replace function public.v2_annual_revision_access(p_revision_id uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_profile_is_active() and exists (
    select 1 from public.annual_plan_revisions r join public.annual_plan_cycles c on c.id = r.cycle_id
    where r.id = p_revision_id and (
      (p_write and r.owner_id = (select auth.uid()) and r.status in ('draft_owner_only'))
      or (not p_write and (
        r.owner_id = (select auth.uid())
        or (r.status = 'pending_executive' and r.assigned_executive_id = (select auth.uid()))
        or (r.status = 'approved' and public.can_use_brand_capability(c.brand_id, 'view_approved_plan'::public.user_capability))
        or public.current_user_is_administrator_v2()
      ))
    )
  );
$$;

-- Keep the cycle and revision policies from recursively evaluating each
-- other. The helper runs as the definer (postgres), so its catalog lookups
-- are not re-entered through the caller's RLS policies.
create or replace function public.v2_annual_cycle_access(p_cycle_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_profile_is_active() and (
    public.current_user_is_administrator_v2()
    or exists (
      select 1
      from public.annual_plan_cycles c
      where c.id = p_cycle_id
        and public.can_use_brand_capability(c.brand_id, 'view_approved_plan'::public.user_capability)
    )
    or exists (
      select 1
      from public.annual_plan_revisions r
      where r.cycle_id = p_cycle_id
        and r.owner_id = (select auth.uid())
    )
  );
$$;

drop policy if exists annual_plan_cycles_select_scoped on public.annual_plan_cycles;
create policy annual_plan_cycles_select_scoped on public.annual_plan_cycles
for select to authenticated using (public.v2_annual_cycle_access(id));

drop policy if exists annual_plan_revisions_select_owner_or_approval on public.annual_plan_revisions;
create policy annual_plan_revisions_select_owner_or_approval on public.annual_plan_revisions
for select to authenticated using (public.v2_annual_revision_access(id, false));

grant execute on function public.v2_annual_revision_access(uuid, boolean), public.v2_annual_cycle_access(uuid)
  to authenticated, service_role;

create or replace function public.v2_annual_plan_validate_ready(p_revision_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  line_count integer;
  wave_count integer;
begin
  select count(*) into line_count from public.annual_plan_lines where revision_id = p_revision_id;
  if line_count = 0 then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_NO_LINES'; end if;
  select count(*) into wave_count from public.purchase_wave_revisions where revision_id = p_revision_id;
  if wave_count = 0 then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_NO_WAVES'; end if;
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
end;
$$;

create or replace function public.v2_annual_plan_supersede_baseline(p_cycle_id uuid, p_revision_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.annual_plan_revisions
  set status = 'superseded', updated_at = now()
  where cycle_id = p_cycle_id and status = 'approved' and id <> p_revision_id;
$$;

create or replace function public.submit_annual_plan_v2(
  p_revision_id uuid,
  p_expected_lock_version integer,
  p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  revision_row public.annual_plan_revisions%rowtype;
  cycle_row public.annual_plan_cycles%rowtype;
  executive_id uuid;
  actor_tier public.org_tier;
  case_row public.workflow_approval_cases%rowtype;
  step_row public.workflow_approval_steps%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
  is_auto boolean := false;
begin
  if not public.current_profile_is_active() then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_SUBMIT_FORBIDDEN'; end if;
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'action_idempotency_key_required'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('revisionId', p_revision_id, 'expectedLockVersion', p_expected_lock_version);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'submit_annual_plan_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select r.* into revision_row from public.annual_plan_revisions r where r.id = p_revision_id for update;
  if revision_row.id is null or revision_row.owner_id <> actor_id or revision_row.status not in ('draft_owner_only', 'changes_requested') then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_SUBMIT_FORBIDDEN'; end if;
  if revision_row.lock_version <> p_expected_lock_version then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_LOCK_CONFLICT'; end if;
  select c.* into cycle_row from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  select p.org_tier into actor_tier from public.profiles p where p.id = actor_id and p.is_active;
  if actor_tier not in ('manager'::public.org_tier, 'executive'::public.org_tier) then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_SUBMIT_FORBIDDEN'; end if;
  perform public.v2_annual_plan_validate_ready(p_revision_id);
  if actor_tier = 'executive'::public.org_tier then
    executive_id := actor_id;
    is_auto := true;
  else
    select rl.supervisor_id into executive_id
    from public.reporting_lines rl
    join public.profiles executive on executive.id = rl.supervisor_id and executive.is_active and executive.org_tier = 'executive'::public.org_tier
    where rl.user_id = actor_id;
    if executive_id is null then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_EXECUTIVE_REQUIRED'; end if;
  end if;
  if is_auto then
    update public.annual_plan_revisions set status = 'approved', assigned_executive_id = executive_id, submitted_at = now(), approved_at = now(), lock_version = lock_version + 1, updated_at = now() where id = p_revision_id returning * into revision_row;
  else
    update public.annual_plan_revisions set status = 'pending_executive', assigned_executive_id = executive_id, submitted_at = now(), lock_version = lock_version + 1, updated_at = now() where id = p_revision_id returning * into revision_row;
  end if;
  insert into public.workflow_approval_cases(target_kind, target_id, cycle_id, brand_id, status, submitted_by, assigned_executive_id, route_snapshot, submit_idempotency_key, completed_at)
  values ('annual_plan', p_revision_id, cycle_row.id, cycle_row.brand_id, case when is_auto then 'approved' else 'pending' end, actor_id, executive_id,
    jsonb_build_object('tier', actor_tier::text, 'managerId', case when actor_tier = 'manager' then actor_id else null end, 'executiveId', executive_id, 'assignedAt', now()), p_idempotency_key, case when is_auto then now() else null end)
  returning * into case_row;
  insert into public.workflow_approval_steps(case_id, step_order, step_kind, assignee_id, status, acted_by, acted_at, comment)
  values (case_row.id, 1, 'executive', executive_id, case when is_auto then 'approved' else 'pending' end, case when is_auto then actor_id else null end, case when is_auto then now() else null end, case when is_auto then 'CEO/BOD tự phê duyệt kế hoạch do mình lập.' else null end)
  returning * into step_row;
  if is_auto then perform public.v2_annual_plan_supersede_baseline(cycle_row.id, p_revision_id); end if;
  result_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('revisionId', p_revision_id, 'caseId', case_row.id, 'status', revision_row.status, 'assignedExecutiveId', executive_id, 'autoApproved', is_auto, 'lockVersion', revision_row.lock_version));
  perform public.write_audit_event(cycle_row.brand_id, 'annual_plan_submitted', 'annual_plan_revision', p_revision_id, p_idempotency_key, null, result_payload -> 'data', jsonb_build_object('route', case_row.route_snapshot, 'source', 'v2'));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'submit_annual_plan_v2', p_revision_id, result_payload, actor_id);
  return result_payload -> 'data';
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
  if nullif(btrim(coalesce(p_comment, '')), '') is null then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_COMMENT_REQUIRED'; end if;
  select r.* into revision_row from public.annual_plan_revisions r where r.id = p_revision_id for update;
  select c.* into cycle_row from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  select c.* into case_row from public.workflow_approval_cases c where c.target_kind = 'annual_plan' and c.target_id = p_revision_id and c.status = 'pending' for update;
  if case_row.id is null then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_ALREADY_DECIDED'; end if;
  select s.* into step_row from public.workflow_approval_steps s where s.case_id = case_row.id and s.status = 'pending' and s.assignee_id = p_actor_id for update;
  if step_row.id is null then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DECISION_FORBIDDEN'; end if;
  update public.workflow_approval_steps set status = 'changes_requested', acted_by = p_actor_id, acted_at = now(), comment = btrim(p_comment), updated_at = now() where id = step_row.id;
  update public.workflow_approval_cases set status = 'changes_requested', completed_at = now(), updated_at = now() where id = case_row.id;
  insert into public.workflow_approval_decisions(case_id, step_id, decision, comment, decided_by, idempotency_key) values (case_row.id, step_row.id, 'request_changes', btrim(p_comment), p_actor_id, p_idempotency_key);
  update public.annual_plan_revisions set status = 'changes_requested', updated_at = now() where id = p_revision_id;
  insert into public.annual_plan_revisions(cycle_id, revision_number, owner_id)
  select cycle_row.id, coalesce(max(revision_number), 0) + 1, revision_row.owner_id
  from public.annual_plan_revisions where cycle_id = cycle_row.id returning * into new_revision;
  insert into public.annual_plan_lines(revision_id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price)
  select new_revision.id, product_id, opening_stock, annual_paid_qty, annual_foc_qty, ex_price from public.annual_plan_lines where revision_id = p_revision_id;
  for wave in select * from public.purchase_waves where cycle_id = cycle_row.id loop
    for old_wave_revision in select * from public.purchase_wave_revisions where wave_id = wave.id and revision_id = p_revision_id loop
      insert into public.purchase_wave_revisions(wave_id, revision_id, needed_month) values (wave.id, new_revision.id, old_wave_revision.needed_month) returning id into new_wave_revision_id;
      insert into public.purchase_wave_allocations(wave_revision_id, product_id, paid_qty, foc_qty, ex_price)
      select new_wave_revision_id, product_id, paid_qty, foc_qty, ex_price from public.purchase_wave_allocations where wave_revision_id = old_wave_revision.id;
    end loop;
  end loop;
  perform public.write_audit_event(cycle_row.brand_id, 'annual_plan_changes_requested', 'annual_plan_revision', p_revision_id, p_idempotency_key, null, jsonb_build_object('newRevisionId', new_revision.id, 'comment', btrim(p_comment)), jsonb_build_object('source', 'v2'));
  return jsonb_build_object('previousRevisionId', p_revision_id, 'revisionId', new_revision.id, 'revisionNumber', new_revision.revision_number, 'status', new_revision.status, 'comment', btrim(p_comment));
end;
$$;

create or replace function public.request_annual_plan_changes_v2(p_revision_id uuid, p_comment text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); existing_action public.action_idempotency%rowtype; request_payload jsonb; result jsonb;
begin
  if not public.current_profile_is_active() then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DECISION_FORBIDDEN'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key); request_payload := jsonb_build_object('revisionId', p_revision_id, 'comment', btrim(coalesce(p_comment, '')));
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then if existing_action.action_type <> 'request_annual_plan_changes_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if; return existing_action.result -> 'data'; end if;
  result := public.v2_request_annual_plan_changes_core(p_revision_id, p_comment, p_idempotency_key, actor_id);
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'request_annual_plan_changes_v2', p_revision_id, jsonb_build_object('request', request_payload, 'data', result), actor_id);
  return result;
end;
$$;

create or replace function public.decide_annual_plan_v2(
  p_revision_id uuid,
  p_decision text,
  p_comment text,
  p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result jsonb;
  revision_row public.annual_plan_revisions%rowtype;
  cycle_row public.annual_plan_cycles%rowtype;
  case_row public.workflow_approval_cases%rowtype;
  step_row public.workflow_approval_steps%rowtype;
begin
  if p_decision not in ('approve', 'request_changes', 'reject') then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_DECISION_INVALID'; end if;
  if p_decision <> 'approve' and nullif(btrim(coalesce(p_comment, '')), '') is null then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_COMMENT_REQUIRED'; end if;
  if not public.current_profile_is_active() then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DECISION_FORBIDDEN'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key); request_payload := jsonb_build_object('revisionId', p_revision_id, 'decision', p_decision, 'comment', btrim(coalesce(p_comment, '')));
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then if existing_action.action_type <> 'decide_annual_plan_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if; return existing_action.result -> 'data'; end if;
  select r.* into revision_row from public.annual_plan_revisions r where r.id = p_revision_id for update;
  select c.* into cycle_row from public.annual_plan_cycles c where c.id = revision_row.cycle_id;
  select c.* into case_row from public.workflow_approval_cases c where c.target_kind = 'annual_plan' and c.target_id = p_revision_id and c.status = 'pending' for update;
  if case_row.id is null then raise exception using errcode = 'P0001', message = 'ANNUAL_PLAN_ALREADY_DECIDED'; end if;
  select s.* into step_row from public.workflow_approval_steps s where s.case_id = case_row.id and s.status = 'pending' for update;
  if step_row.id is null or step_row.assignee_id <> actor_id then raise exception using errcode = '42501', message = 'ANNUAL_PLAN_DECISION_FORBIDDEN'; end if;
  if p_decision = 'request_changes' then
    result := public.v2_request_annual_plan_changes_core(p_revision_id, p_comment, p_idempotency_key, actor_id);
  else
    update public.workflow_approval_steps set status = case when p_decision = 'approve' then 'approved' else 'rejected' end, acted_by = actor_id, acted_at = now(), comment = btrim(coalesce(p_comment, '')), updated_at = now() where id = step_row.id;
    update public.workflow_approval_cases set status = case when p_decision = 'approve' then 'approved' else 'rejected' end, completed_at = now(), updated_at = now() where id = case_row.id;
    insert into public.workflow_approval_decisions(case_id, step_id, decision, comment, decided_by, idempotency_key) values (case_row.id, step_row.id, p_decision, btrim(coalesce(p_comment, '')), actor_id, p_idempotency_key);
    update public.annual_plan_revisions set status = (case when p_decision = 'approve' then 'approved' else 'rejected' end)::public.annual_plan_status, approved_at = case when p_decision = 'approve' then now() else null end, lock_version = lock_version + 1, updated_at = now() where id = p_revision_id returning * into revision_row;
    if p_decision = 'approve' then perform public.v2_annual_plan_supersede_baseline(cycle_row.id, p_revision_id); end if;
    result := jsonb_build_object('revisionId', p_revision_id, 'caseId', case_row.id, 'status', revision_row.status, 'decision', p_decision, 'approverId', actor_id, 'lockVersion', revision_row.lock_version);
  end if;
  perform public.write_audit_event(cycle_row.brand_id, 'annual_plan_decision_recorded', 'annual_plan_revision', p_revision_id, p_idempotency_key, null, result, jsonb_build_object('decision', p_decision, 'source', 'v2'));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'decide_annual_plan_v2', p_revision_id, jsonb_build_object('request', request_payload, 'data', result), actor_id);
  return result;
end;
$$;

revoke all on function public.v2_annual_plan_validate_ready(uuid), public.submit_annual_plan_v2(uuid, integer, uuid), public.request_annual_plan_changes_v2(uuid, text, uuid), public.decide_annual_plan_v2(uuid, text, text, uuid) from public, anon;
grant execute on function public.submit_annual_plan_v2(uuid, integer, uuid), public.request_annual_plan_changes_v2(uuid, text, uuid), public.decide_annual_plan_v2(uuid, text, text, uuid) to authenticated, service_role;
