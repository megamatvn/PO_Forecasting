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

const exceptionLabels: Record<string, string> = {
  criticalShortage: "Thiếu hàng critical",
  budgetExceeded: "Vượt ngân sách",
  newSupplier: "Nhà cung cấp mới",
};

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
          const enabledExceptions = Object.entries(request.exceptionFlags)
            .filter(([, enabled]) => enabled)
            .map(([name]) => exceptionLabels[name] ?? name);
          const hasException = enabledExceptions.length > 0;
          const isActive = request.id === activeRequestId;
          return (
            <Link
              key={request.id}
              href={`/approvals?requestId=${request.id}`}
              className={isActive ? "is-active" : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <div>
                <strong>{request.cycleCode}</strong>
                <span>Phiên bản {request.versionNumber}</span>
              </div>
              <small>{statusLabels[request.status]}</small>
              <span className="approval-inbox__level">
                Cấp duyệt {request.currentLevel}/{request.requiredLevels}
              </span>
              <p>
                {Number(request.planAmount).toLocaleString("vi-VN")} {request.currencyCode}
              </p>
              {isActive ? <span className="approval-inbox__current">Đang xem</span> : null}
              {hasException ? (
                <b aria-label="Ngoại lệ">{enabledExceptions.join(" · ")}</b>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
