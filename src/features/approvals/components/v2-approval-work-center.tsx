import Link from "next/link";
import {
  approvalWorkLevelLabels,
  type ApprovalWorkItem,
} from "@/features/approvals/contracts-v2";

interface V2ApprovalWorkCenterProps {
  items: ApprovalWorkItem[];
}

export function V2ApprovalWorkCenter({ items }: V2ApprovalWorkCenterProps) {
  if (!items.length) {
    return (
      <section className="empty-state" aria-labelledby="approval-work-center-title">
        <p className="section-index">Danh sách trống</p>
        <h2 id="approval-work-center-title">Không có hồ sơ nào đang chờ bạn xử lý.</h2>
        <p>Hồ sơ sẽ xuất hiện tại đây khi được giao đúng tuyến phê duyệt.</p>
      </section>
    );
  }

  return (
    <section className="annual-plan-approval-inbox" aria-labelledby="approval-work-center-title">
      <header>
        <div>
          <p className="section-index">Trung tâm phê duyệt V2</p>
          <h2 id="approval-work-center-title">Hồ sơ chờ duyệt</h2>
          <p>Chỉ hiển thị hồ sơ được giao trực tiếp cho bạn ở cấp hiện tại.</p>
        </div>
        <span className="status-badge status-badge--neutral">{items.length} hồ sơ</span>
      </header>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.brandCode} · {item.brandName} · {item.planningYear}</span>
              <span>{item.submittedBy} · {approvalWorkLevelLabels[item.currentLevel]}</span>
              <span>{item.assignedPoLabel ?? "Chưa chọn PO"}{item.overPlan ? " · Vượt kế hoạch — cần duyệt 2 cấp" : ""}</span>
            </div>
            <Link className="button button--primary" href={item.href} aria-label={`Mở và xử lý ${item.title}`}>
              Mở và xử lý
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
