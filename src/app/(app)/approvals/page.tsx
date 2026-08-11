import { ApprovalInbox } from "@/features/approvals/components/approval-inbox";
import { ApprovalReview } from "@/features/approvals/components/approval-review";
import { loadApprovalInbox } from "@/features/approvals/server/load-approval-inbox";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";

interface ApprovalsPageProps {
  searchParams: Promise<{ requestId?: string }>;
}

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const [access, query] = await Promise.all([getCurrentAccess(), searchParams]);
  const requests = access ? await loadApprovalInbox(access) : [];
  const activeRequest =
    requests.find((request) => request.id === query.requestId) ?? requests[0];

  return (
    <div className="page-shell approvals-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Approval Center</p>
          <h1>Hồ sơ chờ duyệt</h1>
        </div>
        <span className="status-badge status-badge--neutral">
          Snapshot policy bất biến
        </span>
      </header>
      {activeRequest ? (
        <div className="approvals-layout">
          <ApprovalInbox requests={requests} activeRequestId={activeRequest.id} />
          <ApprovalReview request={activeRequest} />
        </div>
      ) : (
        <section className="empty-state">
          <p className="section-index">Inbox trống</p>
          <h2>Không có hồ sơ nào trong phạm vi truy cập.</h2>
          <p>Hồ sơ sẽ xuất hiện sau khi Planner gửi một Draft để duyệt.</p>
        </section>
      )}
    </div>
  );
}
