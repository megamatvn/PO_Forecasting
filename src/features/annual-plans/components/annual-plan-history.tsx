"use client";

import { AnnualPlanDiff, type AnnualPlanDiffRow } from "./annual-plan-diff";

export type AnnualPlanHistoryStatus = "draft_owner_only" | "pending_executive" | "approved" | "changes_requested" | "rejected" | "superseded";
export interface AnnualPlanHistoryRevision { id: string; revisionNumber: number; status: AnnualPlanHistoryStatus; ownerName: string; createdAt: string; approvedAt: string | null; approverName: string | null; changes: AnnualPlanDiffRow[] }

const statusLabels: Record<AnnualPlanHistoryStatus, string> = {
  draft_owner_only: "Bản nháp riêng tư", pending_executive: "Chờ CEO/BOD duyệt", approved: "Đã phê duyệt", changes_requested: "Yêu cầu chỉnh sửa", rejected: "Đã từ chối", superseded: "Đã thay thế",
};

export function AnnualPlanHistory({ revisions, currentApprovedRevisionId, onCreateRevision, showCreateAction = true }: { revisions: AnnualPlanHistoryRevision[]; currentApprovedRevisionId: string | null; onCreateRevision?: (revisionId: string) => void; showCreateAction?: boolean }) {
  return <section className="annual-plan-history" aria-labelledby="annual-plan-history-title"><header><div><p className="section-index">Theo dõi thay đổi</p><h2 id="annual-plan-history-title">Lịch sử phiên bản</h2><p>Phiên bản cũ và người phê duyệt được giữ nguyên để đối soát.</p></div>{showCreateAction && currentApprovedRevisionId ? <button type="button" className="button button--primary" onClick={() => onCreateRevision?.(currentApprovedRevisionId)}>Tạo phiên bản điều chỉnh</button> : null}</header><ol>{[...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber).map((revision) => <li key={revision.id} className={revision.id === currentApprovedRevisionId ? "is-current" : undefined}><div className="annual-plan-history__row"><div><h3>Phiên bản {revision.revisionNumber}</h3><p>{revision.ownerName} · {new Date(revision.createdAt).toLocaleDateString("vi-VN")}</p></div><span className="status-badge status-badge--neutral">{statusLabels[revision.status]}</span></div><dl><div><dt>Người duyệt</dt><dd>{revision.approverName ?? "Chưa có"}</dd></div><div><dt>Thời điểm duyệt</dt><dd>{revision.approvedAt ? new Date(revision.approvedAt).toLocaleDateString("vi-VN") : "Chưa duyệt"}</dd></div></dl><AnnualPlanDiff changes={revision.changes} /></li>)}</ol></section>;
}

export { statusLabels as annualPlanHistoryStatusLabels };
