import Link from "next/link";
import type { ApprovalWorkItem } from "@/features/approvals/contracts-v2";

export function AnnualPlanApprovalInbox({ items }: { items: ApprovalWorkItem[] }) {
  if (!items.length) return null;
  return <section className="annual-plan-approval-inbox" aria-labelledby="annual-plan-approval-inbox-title"><header><div><p className="section-index">Kế hoạch mua hàng</p><h2 id="annual-plan-approval-inbox-title">Kế hoạch cần bạn phê duyệt</h2><p>Chỉ những kế hoạch được giao đúng tuyến mới xuất hiện tại đây.</p></div><span className="status-badge status-badge--neutral">{items.length} hồ sơ</span></header><ul>{items.map((item) => <li key={item.id}><div><strong>{item.brandCode} · {item.brandName} · {item.planningYear}</strong><span>{item.submittedBy} · {new Date(item.submittedAt).toLocaleDateString("vi-VN")}</span></div><Link className="button button--primary" href={item.href}>Mở và xử lý</Link></li>)}</ul></section>;
}
