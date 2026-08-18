-- Complete the proposal cancellation workflow. A cancellation request always
-- starts at the assigned Manager; two-level routes continue to the assigned
-- Executive after the Manager approves. Capacity is released atomically only
-- when the final cancellation decision is approved.

create or replace function public.request_proposal_cancellation_v2(
  p_proposal_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.purchase_proposals%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
begin
  request_payload := jsonb_build_object(
    'proposalId', p_proposal_id,
    'reason', btrim(coalesce(p_reason, ''))
  );
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action
  from public.action_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'request_proposal_cancellation_v2'
       or existing_action.created_by <> actor_id
       or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;

  select * into proposal_row
  from public.purchase_proposals
  where id = p_proposal_id
  for update;
  if proposal_row.id is null
     or proposal_row.owner_id <> actor_id
     or proposal_row.status <> 'approved'
     or length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception using errcode = '42501', message = 'PROPOSAL_CANCELLATION_FORBIDDEN';
  end if;

  update public.purchase_proposals
  set status = 'cancellation_pending_manager',
      lock_version = lock_version + 1,
      updated_at = now()
  where id = p_proposal_id
  returning * into proposal_row;

  perform public.write_audit_event(
    proposal_row.brand_id,
    'proposal_cancellation_requested',
    'purchase_proposal',
    proposal_row.id,
    p_idempotency_key,
    null,
    jsonb_build_object('proposalId', proposal_row.id, 'reason', btrim(p_reason)),
    jsonb_build_object('source', 'v2', 'route', proposal_row.route_kind)
  );

  if proposal_row.assigned_manager_id is not null then
    perform public.enqueue_notification_v2(
      proposal_row.assigned_manager_id,
      proposal_row.id,
      'proposal_cancellation_required',
      'Cần duyệt hủy đề xuất',
      'Một đề xuất đã duyệt đang chờ quản lý xác nhận hủy để hoàn lại năng lực PO.',
      '/proposals/' || proposal_row.id::text
    );
  end if;

  result_payload := jsonb_build_object(
    'proposalId', proposal_row.id,
    'status', proposal_row.status,
    'lockVersion', proposal_row.lock_version
  );
  insert into public.action_idempotency(
    idempotency_key, action_type, resource_id, result, created_by
  ) values (
    p_idempotency_key,
    'request_proposal_cancellation_v2',
    p_proposal_id,
    jsonb_build_object('request', request_payload, 'data', result_payload),
    actor_id
  );
  return result_payload;
end;
$$;

create or replace function public.decide_proposal_cancellation_v2(
  p_proposal_id uuid,
  p_decision text,
  p_comment text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.purchase_proposals%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
  result_payload jsonb;
  next_status text;
  capacity_released boolean := false;
begin
  request_payload := jsonb_build_object(
    'proposalId', p_proposal_id,
    'decision', p_decision,
    'comment', btrim(coalesce(p_comment, ''))
  );
  perform public.lock_action_idempotency_key(p_idempotency_key);
  select * into existing_action
  from public.action_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'decide_proposal_cancellation_v2'
       or existing_action.created_by <> actor_id
       or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'CANCELLATION_DECISION_INVALID';
  end if;
  if p_decision = 'reject' and length(btrim(coalesce(p_comment, ''))) < 10 then
    raise exception using errcode = 'P0001', message = 'CANCELLATION_COMMENT_REQUIRED';
  end if;

  select * into proposal_row
  from public.purchase_proposals
  where id = p_proposal_id
  for update;
  if proposal_row.id is null then
    raise exception using errcode = 'P0001', message = 'CANCELLATION_PROPOSAL_NOT_FOUND';
  end if;
  if proposal_row.status not in ('cancellation_pending_manager', 'cancellation_pending_executive') then
    raise exception using errcode = '42501', message = 'CANCELLATION_DECISION_FORBIDDEN';
  elsif proposal_row.status = 'cancellation_pending_manager'
        and proposal_row.assigned_manager_id = actor_id then
    null;
  elsif proposal_row.status = 'cancellation_pending_executive'
        and proposal_row.assigned_executive_id = actor_id then
    null;
  else
    raise exception using errcode = '42501', message = 'CANCELLATION_DECISION_FORBIDDEN';
  end if;

  next_status := case
    when p_decision = 'reject' then 'approved'
    when proposal_row.status = 'cancellation_pending_manager'
         and proposal_row.route_kind = 'manager_then_executive'
         and proposal_row.assigned_executive_id is not null
         and proposal_row.assigned_executive_id <> actor_id
      then 'cancellation_pending_executive'
    else 'cancelled'
  end;

  update public.purchase_proposals
  set status = next_status,
      lock_version = lock_version + 1,
      updated_at = now()
  where id = p_proposal_id
  returning * into proposal_row;

  if next_status = 'cancelled' then
    update public.capacity_reservations
    set status = 'released', released_at = now()
    where proposal_revision_id in (
      select id from public.proposal_revisions where proposal_id = p_proposal_id
    )
      and status in ('held', 'consumed');
    capacity_released := true;
  end if;

  perform public.write_audit_event(
    proposal_row.brand_id,
    'proposal_cancellation_decided',
    'purchase_proposal',
    proposal_row.id,
    p_idempotency_key,
    null,
    jsonb_build_object(
      'proposalId', proposal_row.id,
      'decision', p_decision,
      'comment', btrim(coalesce(p_comment, '')),
      'status', proposal_row.status
    ),
    jsonb_build_object(
      'source', 'v2',
      'capacityReleased', capacity_released,
      'route', proposal_row.route_kind
    )
  );

  if next_status = 'cancellation_pending_executive'
     and proposal_row.assigned_executive_id is not null then
    perform public.enqueue_notification_v2(
      proposal_row.assigned_executive_id,
      proposal_row.id,
      'proposal_cancellation_required',
      'Cần CEO/BOD duyệt hủy đề xuất',
      'Quản lý đã đồng ý hủy; vui lòng xác nhận để hoàn lại năng lực PO.',
      '/proposals/' || proposal_row.id::text
    );
  elsif next_status = 'cancelled' then
    perform public.enqueue_notification_v2(
      proposal_row.owner_id,
      proposal_row.id,
      'proposal_cancelled',
      'Đề xuất đã được hủy',
      'Đề xuất đã hủy và năng lực PO đã được hoàn lại.',
      '/proposals/' || proposal_row.id::text
    );
  elsif next_status = 'approved' then
    perform public.enqueue_notification_v2(
      proposal_row.owner_id,
      proposal_row.id,
      'proposal_cancellation_rejected',
      'Yêu cầu hủy bị từ chối',
      coalesce(nullif(btrim(p_comment), ''), 'Đề xuất vẫn giữ trạng thái đã duyệt.'),
      '/proposals/' || proposal_row.id::text
    );
  end if;

  result_payload := jsonb_build_object(
    'proposalId', proposal_row.id,
    'status', proposal_row.status,
    'lockVersion', proposal_row.lock_version,
    'capacityReleased', capacity_released
  );
  insert into public.action_idempotency(
    idempotency_key, action_type, resource_id, result, created_by
  ) values (
    p_idempotency_key,
    'decide_proposal_cancellation_v2',
    p_proposal_id,
    jsonb_build_object('request', request_payload, 'data', result_payload),
    actor_id
  );
  return result_payload;
end;
$$;

create or replace function public.v2_proposal_revision_access(
  p_revision_id uuid,
  p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_profile_is_active() and exists (
    select 1
    from public.proposal_revisions pr
    join public.purchase_proposals p on p.id = pr.proposal_id
    where pr.id = p_revision_id
      and (
        (p_write and p.owner_id = (select auth.uid()) and p.status in ('draft', 'changes_requested'))
        or (not p_write and (
          (p.status in ('draft', 'changes_requested') and p.owner_id = (select auth.uid()))
          or (p.status = 'pending_manager' and (p.owner_id = (select auth.uid()) or p.assigned_manager_id = (select auth.uid())))
          or (p.status = 'pending_executive' and (p.owner_id = (select auth.uid()) or p.assigned_executive_id = (select auth.uid())))
          or (p.status = 'cancellation_pending_manager' and (p.owner_id = (select auth.uid()) or p.assigned_manager_id = (select auth.uid())))
          or (p.status = 'cancellation_pending_executive' and (p.owner_id = (select auth.uid()) or p.assigned_executive_id = (select auth.uid())))
          or (p.status in ('approved', 'rejected', 'withdrawn', 'cancelled') and (p.owner_id = (select auth.uid()) or public.can_use_brand_capability(p.brand_id, 'view_approved_plan'::public.user_capability)))
          or public.current_user_is_administrator_v2()
        ))
      )
  );
$$;

drop policy if exists purchase_proposals_select_scoped on public.purchase_proposals;
create policy purchase_proposals_select_scoped on public.purchase_proposals
for select to authenticated using (
  public.current_profile_is_active()
  and (
    owner_id = (select auth.uid())
    or (status = 'pending_manager' and assigned_manager_id = (select auth.uid()))
    or (status = 'pending_executive' and assigned_executive_id = (select auth.uid()))
    or (status = 'cancellation_pending_manager' and assigned_manager_id = (select auth.uid()))
    or (status = 'cancellation_pending_executive' and assigned_executive_id = (select auth.uid()))
    or (status in ('approved', 'rejected', 'withdrawn', 'cancelled') and public.can_use_brand_capability(brand_id, 'view_approved_plan'::public.user_capability))
    or public.current_user_is_administrator_v2()
  )
);

grant execute on function public.request_proposal_cancellation_v2(uuid, text, uuid), public.decide_proposal_cancellation_v2(uuid, text, text, uuid) to authenticated, service_role;
revoke all on function public.request_proposal_cancellation_v2(uuid, text, uuid), public.decide_proposal_cancellation_v2(uuid, text, text, uuid) from public, anon;
