import Link from "next/link";
import type { ProposalListItemDTO } from "../server/load-proposals";

const labels: Record<string, string> = { draft: "Bản nháp", pending_manager: "Chờ quản lý", pending_executive: "Chờ CEO/BOD", changes_requested: "Cần chỉnh sửa", approved: "Đã duyệt", rejected: "Từ chối", withdrawn: "Đã rút", cancelled: "Đã huỷ" };
export function ProposalList({ proposals }: { proposals: ProposalListItemDTO[] }) {
  if (!proposals.length) return <section className="empty-state"><p className="section-index">Chưa có đề xuất</p><h2>Chưa có đề xuất mua hàng trong phạm vi của bạn.</h2><p>Bản nháp chỉ xuất hiện với người tạo; các bước đang chờ sẽ xuất hiện với đúng người phụ trách.</p></section>;
  return <section className="proposal-list" aria-label="Danh sách đề xuất"><header><div><p className="section-index">Theo dõi xử lý</p><h2>Đề xuất mua hàng</h2></div><span>{proposals.length} đề xuất</span></header><ul>{proposals.map((proposal) => <li key={proposal.id}><Link href={`/proposals/${proposal.id}`}><span className="proposal-list__main"><strong>{proposal.brandCode} · {proposal.neededMonth}</strong><b>{proposal.ownerName}</b></span><span className="proposal-list__context">{proposal.assignedManagerName ? `Quản lý: ${proposal.assignedManagerName}` : "Chưa gán người duyệt"}</span><span className={`status-badge status-badge--${proposal.status}`}>{labels[proposal.status] ?? proposal.status}</span></Link></li>)}</ul></section>;
}
