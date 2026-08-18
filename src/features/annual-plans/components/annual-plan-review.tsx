"use client";

import { useEffect, useRef, useState } from "react";

export type AnnualPlanReviewRole = "manager" | "executive";
export type AnnualPlanReviewStatus = "draft_owner_only" | "pending_executive" | "approved" | "changes_requested" | "rejected";

export interface AnnualPlanReviewWave {
  id: string;
  sequence: number;
  orderMonth: string;
  arrivalMonth: string;
  total: string;
}

export interface AnnualPlanReviewProps {
  revisionId: string;
  ownerName: string;
  brand: { code: string; name: string };
  planningYear: number;
  status: AnnualPlanReviewStatus;
  role: AnnualPlanReviewRole;
  assignedExecutiveName?: string | null;
  totals: { budget: string; paidQty: string; focQty: string; skuCount: number; waveCount: number };
  waves: AnnualPlanReviewWave[];
  errors: string[];
  warnings: string[];
  onSubmit: () => Promise<void> | void;
  onRequestChanges?: (comment: string) => Promise<void> | void;
  onReject?: (comment: string) => Promise<void> | void;
  onSaveDraft?: () => Promise<void> | void;
}

type ReviewAction = "submit" | "request_changes" | "reject";

function ReviewDialog({ recipient, action, dialogTitle, onCancel, onConfirm, busy }: { recipient: string; action: string; dialogTitle: string; onCancel: () => void; onConfirm: (comment: string) => void; busy: boolean }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [comment, setComment] = useState("");
  useEffect(() => {
    cancelRef.current?.focus();
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal annual-plan-review__dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="annual-plan-review-dialog-title">
        <p className="section-index">Xác nhận</p>
        <h2 id="annual-plan-review-dialog-title">{dialogTitle}</h2>
        <p>{action === "Yêu cầu chỉnh sửa" ? <>Hồ sơ sẽ được trả về cho người lập để cập nhật.</> : action === "Từ chối" ? <>Hồ sơ sẽ kết thúc ở trạng thái từ chối.</> : <>Bản kế hoạch sẽ được chuyển đến <strong>{recipient}</strong>. Sau khi gửi, nội dung phiên bản này không thể chỉnh sửa trực tiếp.</>}</p>
        {action !== "Hoàn tất & gửi CEO/BOD duyệt" && action !== "Hoàn tất & phê duyệt" ? <label className="annual-plan-review__comment"><span>Lý do bắt buộc</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} required minLength={3} /></label> : null}
        <div className="annual-plan-review__dialog-actions">
          <button type="button" className="button" ref={cancelRef} onClick={onCancel} disabled={busy}>Hủy</button>
          <button type="button" className="button button--primary" onClick={() => onConfirm(comment)} disabled={busy || (action !== "Hoàn tất & gửi CEO/BOD duyệt" && action !== "Hoàn tất & phê duyệt" && comment.trim().length < 3)}>{busy ? "Đang xử lý…" : action}</button>
        </div>
      </div>
    </div>
  );
}

export function AnnualPlanReview({ ownerName, brand, planningYear, status, role, assignedExecutiveName, totals, waves, errors, warnings, onSubmit, onRequestChanges, onReject, onSaveDraft }: AnnualPlanReviewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<ReviewAction>("submit");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const canSubmit = ((status === "draft_owner_only" || status === "changes_requested") || (role === "executive" && status === "pending_executive")) && errors.length === 0;
  const action = role === "executive" ? "Hoàn tất & phê duyệt" : "Hoàn tất & gửi CEO/BOD duyệt";
  const recipient = role === "executive" ? "trạng thái đã phê duyệt" : (assignedExecutiveName ?? "CEO/BOD được phân công");

  async function confirm(comment: string) {
    setBusy(true);
    setMessage(null);
    try {
      if (dialogAction === "request_changes") await onRequestChanges?.(comment);
      else if (dialogAction === "reject") await onReject?.(comment);
      else await onSubmit();
      setDialogOpen(false);
      setMessage(dialogAction === "request_changes" ? "Đã yêu cầu người lập chỉnh sửa." : dialogAction === "reject" ? "Đã từ chối kế hoạch." : role === "executive" ? "Kế hoạch đã được phê duyệt." : "Kế hoạch đã được gửi CEO/BOD duyệt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể hoàn tất thao tác.");
    } finally {
      setBusy(false);
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }

  return (
    <section className="annual-plan-review" aria-labelledby="annual-plan-review-title">
      <header className="annual-plan-review__header">
        <div><p className="section-index">Bước 4 · Xác nhận</p><h2 id="annual-plan-review-title">Kiểm tra và xác nhận</h2><p>Kiểm tra lại phạm vi, tổng lượng và lịch mua trước khi chuyển hồ sơ.</p></div>
        <span className="status-badge status-badge--neutral">{status === "draft_owner_only" ? "Bản nháp riêng tư" : status === "changes_requested" ? "Cần chỉnh sửa" : "Đang xử lý"}</span>
      </header>
      <dl className="annual-plan-review__scope">
        <div><dt>Nhãn hàng</dt><dd>{brand.code} · {brand.name}</dd></div>
        <div><dt>Năm kế hoạch</dt><dd>{planningYear}</dd></div>
        <div><dt>Người lập</dt><dd>{ownerName}</dd></div>
        <div><dt>Tuyến duyệt</dt><dd>{role === "executive" ? "CEO/BOD tự phê duyệt" : assignedExecutiveName ?? "CEO/BOD được phân công"}</dd></div>
      </dl>
      <div className="annual-plan-review__totals" aria-label="Tổng hợp kế hoạch">
        <div><span>Ngân sách</span><strong>{totals.budget}</strong></div>
        <div><span>Qty trả tiền</span><strong>{totals.paidQty}</strong></div>
        <div><span>FOC</span><strong>{totals.focQty}</strong></div>
        <div><span>SKU</span><strong>{totals.skuCount}</strong></div>
        <div><span>Đợt mua</span><strong>{totals.waveCount}</strong></div>
      </div>
      <section className="annual-plan-review__waves" aria-labelledby="annual-plan-review-waves-title"><h3 id="annual-plan-review-waves-title">Lịch đợt mua</h3>{waves.length ? <ul>{waves.map((wave) => <li key={wave.id}><strong>PO #{wave.sequence}</strong><span>{wave.orderMonth} → {wave.arrivalMonth}</span><b>{wave.total}</b></li>)}</ul> : <p>Chưa có đợt mua.</p>}</section>
      {errors.length ? <div className="form-alert" role="alert"><strong>Cần sửa trước khi gửi</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
      {warnings.length ? <div className="form-alert form-alert--warning" role="alert"><strong>Cảnh báo cần lưu ý</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
      {message ? <p className="annual-plan-review__message" role="status">{message}</p> : null}
      <footer className="annual-plan-review__actions">
        {onSaveDraft ? <button type="button" className="button" onClick={() => void onSaveDraft()}>Lưu nháp và thoát</button> : null}
        {role === "executive" && status === "pending_executive" && onRequestChanges ? <button type="button" className="button" onClick={() => { setDialogAction("request_changes"); setDialogOpen(true); }}>Yêu cầu chỉnh sửa</button> : null}
        {role === "executive" && status === "pending_executive" && onReject ? <button type="button" className="button" onClick={() => { setDialogAction("reject"); setDialogOpen(true); }}>Từ chối</button> : null}
        <button type="button" className="button button--primary" ref={triggerRef} disabled={!canSubmit || busy} onClick={() => { setDialogAction("submit"); setDialogOpen(true); }}>{action}</button>
      </footer>
      {dialogOpen ? <ReviewDialog recipient={recipient} action={dialogAction === "request_changes" ? "Yêu cầu chỉnh sửa" : dialogAction === "reject" ? "Từ chối" : action} dialogTitle={dialogAction === "request_changes" ? "Yêu cầu chỉnh sửa kế hoạch" : dialogAction === "reject" ? "Từ chối kế hoạch" : role === "executive" ? "Xác nhận phê duyệt" : "Xác nhận gửi duyệt"} busy={busy} onCancel={() => setDialogOpen(false)} onConfirm={(comment) => void confirm(comment)} /> : null}
    </section>
  );
}
