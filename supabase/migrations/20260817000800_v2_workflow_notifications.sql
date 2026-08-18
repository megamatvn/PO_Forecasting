-- Keep annual-plan approval notifications in the same transactional workflow
-- as the approval case. Proposal commands already enqueue their richer events;
-- the recipient/source dedupe key makes this trigger safe for both paths.

create or replace function public.notify_workflow_approval_case_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  source_label text;
  source_href text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' and new.assigned_executive_id is not null then
    source_label := case when new.target_kind = 'annual_plan' then 'kế hoạch năm' else 'đề xuất mua hàng' end;
    source_href := case when new.target_kind = 'annual_plan' then '/approvals' else '/proposals/' || new.target_id::text end;
    perform public.enqueue_notification_v2(
      new.assigned_executive_id,
      new.target_id,
      case when new.target_kind = 'annual_plan' then 'annual_plan_approval_required' else 'proposal_approval_required' end,
      'Có hồ sơ cần phê duyệt',
      'Bạn có ' || source_label || ' mới đang chờ xử lý.',
      source_href
    );
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'rejected', 'changes_requested') then
    owner_id := case
      when new.target_kind = 'annual_plan' then (select r.owner_id from public.annual_plan_revisions r where r.id = new.target_id)
      when new.target_kind = 'purchase_proposal' then (select p.owner_id from public.purchase_proposals p where p.id = new.target_id)
      else null
    end;
    if owner_id is not null then
      source_label := case when new.target_kind = 'annual_plan' then 'Kế hoạch năm' else 'Đề xuất mua hàng' end;
      source_href := case when new.target_kind = 'annual_plan' then '/approvals' else '/proposals/' || new.target_id::text end;
      perform public.enqueue_notification_v2(
        owner_id,
        new.target_id,
        case when new.status = 'approved' then 'approval_approved' when new.status = 'rejected' then 'approval_rejected' else 'approval_changes_requested' end,
        source_label || ' đã cập nhật',
        source_label || ' của bạn đã chuyển sang trạng thái ' || new.status || '.',
        source_href
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workflow_approval_case_notifications on public.workflow_approval_cases;
create trigger workflow_approval_case_notifications
after insert or update of status on public.workflow_approval_cases
for each row execute function public.notify_workflow_approval_case_v2();

revoke all on function public.notify_workflow_approval_case_v2() from public, anon, authenticated;
