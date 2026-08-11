import type { PlanningWorkspaceView } from "@/features/planning/planning-types";

const statusLabels = {
  draft: "Draft",
  submitted: "Đã gửi duyệt",
  review_l1: "Chờ duyệt cấp 1",
  review_l2: "Chờ duyệt cấp 2",
  approved: "Đã duyệt",
  changes_requested: "Yêu cầu chỉnh sửa",
  superseded: "Đã thay thế",
} as const;

interface PlanningHeaderProps {
  plan: PlanningWorkspaceView;
  saveLabel?: string;
  viewerCount?: number;
}

export function PlanningHeader({
  plan,
  saveLabel = "Chưa có thay đổi",
  viewerCount = 0,
}: PlanningHeaderProps) {
  return (
    <header className="planning-header">
      <div>
        <p className="eyebrow">{plan.cycle.code} · Forecast 5M</p>
        <h1>{plan.cycle.name}</h1>
        <p>
          Phiên bản {plan.version.versionNumber} · Cập nhật{" "}
          {new Intl.DateTimeFormat("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Ho_Chi_Minh",
          }).format(new Date(plan.version.updatedAt))}
        </p>
      </div>
      <div className="planning-header__status">
        <span className={`status-badge status-badge--${plan.version.status}`}>
          {statusLabels[plan.version.status]}
        </span>
        <small aria-live="polite">{saveLabel}</small>
        {viewerCount > 0 ? (
          <small>{viewerCount.toLocaleString("vi-VN")} người đang xem</small>
        ) : null}
      </div>
    </header>
  );
}
