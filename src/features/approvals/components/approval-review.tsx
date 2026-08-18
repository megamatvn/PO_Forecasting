"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ApprovalDecision,
  ApprovalRequestView,
} from "@/features/approvals/approval-types";
import { VersionDiff } from "@/features/versions/components/version-diff";
import type { ApprovalRoute } from "@/lib/domain/types";

interface SubmitPlanDialogProps {
  open: boolean;
  route: ApprovalRoute;
  onCancel(): void;
  onConfirm(): void;
}

const routeReasons = {
  fixed: "Chính sách mặc định bắt buộc đủ hai cấp duyệt.",
  under_threshold: "Giá trị kế hoạch nằm dưới hạn mức đã thiết lập.",
  threshold_met: "Giá trị kế hoạch đạt hoặc vượt hạn mức hai cấp.",
  exception: "Kế hoạch có ngoại lệ cần chuyển đủ hai cấp duyệt.",
} as const;

export function SubmitPlanDialog({
  open,
  route,
  onCancel,
  onConfirm,
}: SubmitPlanDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="approval-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-plan-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }

        if (event.key === "Tab") {
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement;
          if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          } else if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
          }
        }
      }}
    >
      <div className="approval-dialog__panel">
        <p className="section-index">Xác nhận luồng duyệt</p>
        <h2 id="submit-plan-title">
          Kế hoạch sẽ được duyệt {route.levels} cấp
        </h2>
        <div className="approval-route-visual" aria-label="Thứ tự người duyệt">
          <span>Người lập kế hoạch</span>
          <b aria-hidden="true">→</b>
          <strong>
            {route.levels === 2
              ? "Quản lý nhãn hàng → Ban điều hành"
              : "Quản lý nhãn hàng"}
          </strong>
        </div>
        <p>{routeReasons[route.reason]}</p>
        <p className="approval-snapshot-note">
          Chính sách được chụp tại thời điểm gửi; thay đổi cấu hình sau đó không
          tác động hồ sơ đang duyệt.
        </p>
        <div className="approval-dialog__actions">
          <button ref={cancelButtonRef} className="button" type="button" onClick={onCancel}>
            Quay lại kiểm tra
          </button>
          <button className="button button--primary" type="button" onClick={onConfirm}>
            Gửi duyệt {route.levels} cấp
          </button>
        </div>
      </div>
    </div>
  );
}

interface ApprovalReviewProps {
  request: ApprovalRequestView;
  onDecision?(decision: ApprovalDecision): Promise<void>;
}

const routingLabels = {
  fixed: "Hai cấp bắt buộc",
  under_threshold: "Dưới hạn mức",
  threshold_met: "Đạt hạn mức hai cấp",
  exception: "Có ngoại lệ escalated",
} as const;

const statusLabels = {
  pending_l1: "Chờ cấp 1",
  pending_l2: "Chờ cấp 2",
  approved: "Đã duyệt",
  changes_requested: "Yêu cầu sửa",
} as const;

const exceptionLabelMap: Record<string, string> = {
  criticalShortage: "Thiếu hàng critical",
  budgetExceeded: "Vượt ngân sách",
  newSupplier: "Nhà cung cấp mới",
};

export function ApprovalReview({ request, onDecision }: ApprovalReviewProps) {
  const [pendingAction, setPendingAction] = useState<ApprovalDecision["action"] | null>(
    null,
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exceptionLabels = Object.entries(request.exceptionFlags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => exceptionLabelMap[name] ?? name);

  async function submitDecision(decision: ApprovalDecision) {
    if (onDecision) return onDecision(decision);

    const response = await fetch(`/api/approvals/${request.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...decision,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (!response.ok) throw new Error("approval_decision_failed");
    window.location.reload();
  }

  async function confirmDecision() {
    if (!pendingAction) return;
    if (pendingAction === "request_changes" && !comment.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await submitDecision({ action: pendingAction, comment: comment.trim() });
      setPendingAction(null);
      setComment("");
    } catch {
      setError("Không thể ghi nhận quyết định. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="approval-review">
      <header className="approval-review__header">
        <div>
          <p className="eyebrow">{request.cycleCode} · Hồ sơ duyệt</p>
          <h1>Phiên bản {request.versionNumber}</h1>
          <p>
            Gửi bởi {request.submittedBy} ·{" "}
            {new Intl.DateTimeFormat("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Ho_Chi_Minh",
            }).format(new Date(request.submittedAt))}
          </p>
        </div>
        <div>
          <span className="status-badge status-badge--review">
            {statusLabels[request.status]}
          </span>
          <strong className="approval-review__level">
            Cấp duyệt {request.currentLevel}/{request.requiredLevels}
          </strong>
          <small>{routingLabels[request.routingReason]}</small>
        </div>
      </header>

      <section className="approval-impact" aria-label="Tác động kế hoạch">
        <article>
          <span>Giá trị kế hoạch</span>
          <strong>
            {new Intl.NumberFormat("vi-VN", {
              style: "currency",
              currency: request.currencyCode,
            }).format(Number(request.planAmount))}
          </strong>
        </article>
        <article>
          <span>Thay đổi Amount</span>
          <strong>{request.amountChange.toLocaleString("vi-VN")}</strong>
        </article>
        <article>
          <span>Ảnh hưởng thiếu hàng</span>
          <strong>{request.shortageImpact.toLocaleString("vi-VN")}</strong>
        </article>
        <article>
          <span>Khẩn cấp</span>
          <strong>{request.criticalCount.toLocaleString("vi-VN")}</strong>
        </article>
      </section>

      {exceptionLabels.length > 0 ? (
        <section className="approval-exceptions" aria-label="Ngoại lệ cần chú ý">
          <strong>Ngoại lệ ưu tiên</strong>
          <p>{exceptionLabels.join(" · ")}</p>
        </section>
      ) : null}

      <VersionDiff
        fromLabel={`Phiên bản ${Math.max(1, request.versionNumber - 1)}`}
        toLabel={`Phiên bản ${request.versionNumber}`}
        diffs={request.diffs}
      />

      {request.canDecide ? (
        <section className="approval-decision" aria-label="Quyết định duyệt">
          {pendingAction ? (
            <div className="approval-confirmation">
              <h2>
                {pendingAction === "approve"
                  ? "Xác nhận phê duyệt"
                  : "Xác nhận yêu cầu chỉnh sửa"}
              </h2>
              <label className="field-group">
                <span>
                  {pendingAction === "approve"
                    ? "Nhận xét (không bắt buộc)"
                    : "Lý do yêu cầu chỉnh sửa"}
                </span>
                <textarea
                  rows={3}
                  aria-label={
                    pendingAction === "approve"
                      ? "Nhận xét phê duyệt"
                      : "Lý do yêu cầu chỉnh sửa"
                  }
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </label>
              <div>
                <button
                  className="button"
                  type="button"
                  disabled={submitting}
                  onClick={() => setPendingAction(null)}
                >
                  Hủy
                </button>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={
                    submitting ||
                    (pendingAction === "request_changes" && !comment.trim())
                  }
                  onClick={() => void confirmDecision()}
                >
                  {pendingAction === "approve"
                    ? "Xác nhận phê duyệt"
                    : "Xác nhận yêu cầu chỉnh sửa"}
                </button>
              </div>
            </div>
          ) : (
            <div className="approval-decision__actions">
              <button
                className="button"
                type="button"
                onClick={() => setPendingAction("request_changes")}
              >
                Yêu cầu chỉnh sửa
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => setPendingAction("approve")}
              >
                Phê duyệt
              </button>
            </div>
          )}
          {error ? (
            <div className="form-alert form-alert--error" role="alert">
              {error}
            </div>
          ) : null}
        </section>
      ) : (
        <p className="approval-readonly-note">
          Bạn đang xem hồ sơ ở chế độ read-only; quyết định chỉ hiển thị cho
          đúng vai trò của cấp duyệt hiện tại.
        </p>
      )}
    </article>
  );
}
