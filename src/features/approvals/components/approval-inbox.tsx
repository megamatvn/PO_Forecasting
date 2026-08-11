import Link from "next/link";
import type { ApprovalRequestView } from "@/features/approvals/approval-types";

interface ApprovalInboxProps {
  requests: ApprovalRequestView[];
  activeRequestId?: string;
}

const statusLabels = {
  pending_l1: "Chờ cấp 1",
  pending_l2: "Chờ cấp 2",
  approved: "Đã duyệt",
  changes_requested: "Yêu cầu sửa",
} as const;

export function ApprovalInbox({
  requests,
  activeRequestId,
}: ApprovalInboxProps) {
  const prioritized = [...requests].sort((left, right) => {
    const leftExceptions = Object.values(left.exceptionFlags).some(Boolean) ? 1 : 0;
    const rightExceptions = Object.values(right.exceptionFlags).some(Boolean) ? 1 : 0;
    if (leftExceptions !== rightExceptions) return rightExceptions - leftExceptions;
    return new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime();
  });

  return (
    <aside className="approval-inbox" aria-label="Hồ sơ chờ duyệt">
      <header>
        <div>
          <p className="section-index">Inbox</p>
          <h2>Hồ sơ duyệt</h2>
        </div>
        <strong>{requests.length.toLocaleString("vi-VN")}</strong>
      </header>
      <nav aria-label="Danh sách hồ sơ">
        {prioritized.map((request) => {
          const hasException = Object.values(request.exceptionFlags).some(Boolean);
          return (
            <Link
              key={request.id}
              href={`/approvals?requestId=${request.id}`}
              className={request.id === activeRequestId ? "is-active" : undefined}
            >
              <div>
                <strong>{request.cycleCode}</strong>
                <span>Version {request.versionNumber}</span>
              </div>
              <small>{statusLabels[request.status]}</small>
              <p>
                {Number(request.planAmount).toLocaleString("vi-VN")} {request.currencyCode}
              </p>
              {hasException ? <b>Ngoại lệ</b> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
