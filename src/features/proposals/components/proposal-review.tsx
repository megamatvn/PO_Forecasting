"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProposalViewerDTO } from "../server/load-proposals";
import { WaveAssignmentPanel } from "./wave-assignment-panel";

type Decision = "approve" | "reject" | "request_changes";
interface ProposalReviewProps { proposal: ProposalViewerDTO; onAssignWave?: (waveId: string) => Promise<void> | void; onDecision?: (decision: Decision, comment: string) => Promise<void> | void }
const statusLabels: Record<string, string> = {
  draft: "Bản nháp",
  pending_manager: "Chờ quản lý",
  pending_executive: "Chờ CEO/BOD",
  changes_requested: "Cần chỉnh sửa",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  withdrawn: "Đã rút",
  cancellation_pending_manager: "Chờ duyệt hủy cấp quản lý",
  cancellation_pending_executive: "Chờ duyệt hủy cấp CEO/BOD",
  cancelled: "Đã hủy",
};
function number(value: number) { return new Intl.NumberFormat("vi-VN").format(value); }

export function ProposalReview({ proposal, onAssignWave, onDecision }: ProposalReviewProps) {
  const router = useRouter(); const [selectedWaveId, setSelectedWaveId] = useState(""); const [lockVersion, setLockVersion] = useState(proposal.lockVersion); const [comment, setComment] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const selectedWave = proposal.waves.find((wave) => wave.id === selectedWaveId);
  const overPlan = selectedWave ? proposal.lines.some((line) => line.requestedQty > (selectedWave.capacityByProduct.find((item) => item.productId === line.productId)?.remainingQty ?? 0)) : false;
  async function assign(waveId: string) {
    setSelectedWaveId(waveId); setError(null); if (onAssignWave) { try { await onAssignWave(waveId); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể ghi nhận PO."); } return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/v2/proposals/${proposal.id}/assign-wave`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ waveId, lockVersion, idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json() as { data?: { lockVersion?: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Không thể ghi nhận PO.");
      if (typeof body.data?.lockVersion === "number") setLockVersion(body.data.lockVersion);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể ghi nhận PO."); } finally { setBusy(false); }
  }
  async function decide(decision: Decision) { setError(null); if (decision === "approve" && !selectedWaveId) { setError("Bạn phải chọn PO ghi nhận trước khi phê duyệt."); return; } if (decision === "request_changes" && comment.trim().length < 10) { setError("Vui lòng nhập góp ý đủ rõ ràng."); return; } setBusy(true); try { if (onDecision) await onDecision(decision, comment.trim()); else { const response = await fetch(`/api/v2/proposals/${proposal.id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, comment: comment.trim(), idempotencyKey: crypto.randomUUID() }) }); const body = await response.json() as { error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message ?? "Không thể ghi nhận quyết định."); router.refresh(); } } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể ghi nhận quyết định."); } finally { setBusy(false); } }
  async function decideCancellation(decision: "approve" | "reject") {
    setError(null);
    if (decision === "reject" && comment.trim().length < 10) {
      setError("Vui lòng nêu rõ lý do không chấp thuận hủy đề xuất.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/v2/proposals/${proposal.id}/cancellation-decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comment: comment.trim(), idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Không thể ghi nhận quyết định hủy.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể ghi nhận quyết định hủy.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="proposal-review" aria-labelledby="proposal-review-title">
    <header><div><p className="section-index">Đề xuất · {proposal.brandCode} · {proposal.planningYear}</p><h1 id="proposal-review-title">Đề xuất mua hàng</h1><p>{proposal.ownerName} · cần hàng tháng {proposal.neededMonth}</p></div><span className={`status-badge status-badge--${proposal.status}`}>{statusLabels[proposal.status] ?? "Đang xử lý"}</span></header>
    <div className="proposal-review__summary"><div><span>Nhãn hàng</span><strong>{proposal.brandCode} · {proposal.brandName}</strong></div><div><span>Người đề xuất</span><strong>{proposal.ownerName}</strong></div><div><span>Quản lý phụ trách</span><strong>{proposal.managerName ?? "Chưa gán"}</strong></div><div><span>CEO/BOD</span><strong>{proposal.executiveName ?? "Chưa gán"}</strong></div></div>
    <div className="proposal-review__reason"><span>Lý do</span><p>{proposal.reason}</p></div>
    <div className="proposal-review__lines"><h2>Hàng cần bổ sung</h2><table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Số lượng</th></tr></thead><tbody>{proposal.lines.map((line) => <tr key={line.productId}><th>{line.sku}</th><td>{line.name}</td><td>{number(line.requestedQty)}</td></tr>)}</tbody></table></div>
    {proposal.canAssignWave ? <div className="proposal-review__assignment"><h2>Ghi nhận vào PO</h2><p>Người phê duyệt phải chọn một PO cụ thể. Nếu vượt phần còn lại, hệ thống vẫn cho duyệt nhưng bắt buộc đủ hai cấp.</p><WaveAssignmentPanel waves={proposal.waves} selectedWaveId={selectedWaveId} onChange={assign} disabled={busy} />{selectedWave && <div className={overPlan ? "proposal-review__capacity proposal-review__capacity--warning" : "proposal-review__capacity"}>{overPlan ? <strong>Vượt kế hoạch — chuyển duyệt 2 cấp</strong> : <strong>Trong phần còn lại của PO</strong>}<span>{selectedWave.capacityByProduct.map((capacity) => <span key={capacity.productId}>SKU còn lại {number(capacity.remainingQty)}</span>)}</span></div>}</div> : null}
    {proposal.canDecide ? <div className="proposal-review__decision"><h2>Quyết định</h2><label>Ghi chú hoặc góp ý<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Nhập ghi chú khi cần..." /></label><div className="proposal-review__actions"><button className="button button--secondary" type="button" disabled={busy} onClick={() => decide("request_changes")}>Yêu cầu chỉnh sửa</button><button className="button button--danger" type="button" disabled={busy} onClick={() => decide("reject")}>Từ chối</button><button className="button" type="button" disabled={busy} onClick={() => decide("approve")}>Phê duyệt</button></div></div> : null}
    {proposal.canDecideCancellation ? <div className="proposal-review__decision proposal-review__decision--cancellation"><h2>Quyết định hủy</h2><p>Phê duyệt sẽ chuyển đề xuất sang trạng thái đã hủy và hoàn lại năng lực đã giữ trong PO.</p><label>Ghi chú hoặc lý do<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Nhập lý do khi từ chối..." /></label><div className="proposal-review__actions"><button className="button button--secondary" type="button" disabled={busy} onClick={() => decideCancellation("reject")}>Không chấp thuận</button><button className="button button--danger" type="button" disabled={busy} onClick={() => decideCancellation("approve")}>Duyệt hủy & hoàn năng lực</button></div></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
