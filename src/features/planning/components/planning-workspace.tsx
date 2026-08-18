"use client";

import { useEffect, useRef, useState } from "react";
import { SubmitPlanDialog } from "@/features/approvals/components/approval-review";
import { KpiStrip } from "@/features/planning/components/kpi-strip";
import { PlanningHeader } from "@/features/planning/components/planning-header";
import { PlanningProductEditor } from "@/features/planning/components/planning-product-editor";
import { PlanningProductList } from "@/features/planning/components/planning-product-list";
import {
  PlanningWorkflowNav,
  resolvePlanningWorkflowStep,
} from "@/features/planning/components/planning-workflow-nav";
import { StockAlert } from "@/features/planning/components/stock-alert";
import { PoTimeline } from "@/features/reports/components/po-timeline";
import type { PoTimelineItem } from "@/features/reports/report-types";
import { calculateAmount } from "@/lib/domain/money";
import {
  httpDraftSaver,
  useDraftAutosave,
  type DraftSaver,
} from "@/features/planning/hooks/use-draft-autosave";
import { usePlanPresence } from "@/features/planning/hooks/use-plan-presence";
import type {
  PlanningRowView,
  PlanningWorkspaceView,
} from "@/features/planning/planning-types";
import type { ApprovalRoute } from "@/lib/domain/types";

interface PlanningWorkspaceProps {
  initialPlan: PlanningWorkspaceView;
  saveDraft?: DraftSaver;
  autosaveDelayMs?: number;
  presenceDisplayName?: string;
  previewApproval?: (
    exceptionFlags: Record<string, boolean>,
  ) => Promise<ApprovalRoute>;
  submitApproval?: (
    exceptionFlags: Record<string, boolean>,
  ) => Promise<void>;
  workflowStep?: string;
  workflowBasePath?: string;
  workflowBrandId?: string | null;
  poBatches?: readonly PoTimelineItem[];
  initialSelectedPlanLineId?: string | null;
}

const saveLabels = {
  idle: "Chưa có thay đổi",
  saving: "Đang lưu…",
  saved: "Đã lưu",
  error: "Lỗi lưu",
  conflict: "Có xung đột",
} as const;

export function PlanningWorkspace({
  initialPlan,
  saveDraft = httpDraftSaver,
  autosaveDelayMs,
  presenceDisplayName,
  previewApproval,
  submitApproval,
  workflowStep,
  workflowBasePath,
  workflowBrandId,
  poBatches = [],
  initialSelectedPlanLineId,
}: PlanningWorkspaceProps) {
  const hasDirectSelection = Boolean(
    initialSelectedPlanLineId
    && initialPlan.rows.some((row) => row.planLineId === initialSelectedPlanLineId),
  );
  const [plan, setPlan] = useState(initialPlan);
  const [selectedPlanLineId, setSelectedPlanLineId] = useState<string | null>(
    hasDirectSelection
      ? initialSelectedPlanLineId ?? null
      : initialPlan.rows[0]?.planLineId ?? null,
  );
  const [mobileView, setMobileView] = useState<"list" | "detail">(
    hasDirectSelection ? "detail" : "list",
  );
  const [approvalRoute, setApprovalRoute] = useState<ApprovalRoute | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const approvalTriggerRef = useRef<HTMLButtonElement>(null);
  const conflictKeepLocalRef = useRef<HTMLButtonElement>(null);
  const conflictReturnRef = useRef<HTMLElement | null>(null);
  const autosave = useDraftAutosave({
    planVersionId: plan.version.id,
    initialLockVersion: plan.version.lockVersion,
    save: saveDraft,
    delayMs: autosaveDelayMs,
  });
  const previousConflictRef = useRef<typeof autosave.conflict>(null);
  useEffect(() => {
    if (autosave.conflict && !previousConflictRef.current) {
      conflictKeepLocalRef.current?.focus();
    }
    previousConflictRef.current = autosave.conflict;
  }, [autosave.conflict]);
  const viewerCount = usePlanPresence({
    planVersionId: plan.version.id,
    displayName: presenceDisplayName,
  });
  const priorityAlert = plan.rows
    .filter((row) => row.severity === "critical" && row.recommendedQty > 0)
    .sort((left, right) => right.recommendedQty - left.recommendedQty)[0];
  const selectedRow =
    plan.rows.find((row) => row.planLineId === selectedPlanLineId) ?? null;
  const activeWorkflowStep = resolvePlanningWorkflowStep(workflowStep);
  const committedAmount = plan.rows.reduce(
    (total, row) => total + Number(row.amount),
    0,
  );
  const targetAmount = Number(plan.cycle.targetPurchaseAmount);
  const remainingBudget = targetAmount - committedAmount;
  const unresolvedCriticalCount = plan.rows.filter(
    (row) => row.severity === "critical",
  ).length;
  const money = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: plan.cycle.currencyCode,
    maximumFractionDigits: 0,
  });

  function updateRow(
    planLineId: string,
    changes: Partial<Pick<PlanningRowView, "qty" | "focQty" | "exPrice">>,
  ) {
    const row = plan.rows.find((item) => item.planLineId === planLineId);
    if (!row) return;

    const next = { ...row, ...changes };
    const receiptDelta = next.qty + next.focQty - row.qty - row.focQty;
    const projectedStock = row.projectedStock + receiptDelta;
    const recommendedQty = Math.max(0, next.targetStock - projectedStock);
    const updatedRow: PlanningRowView = {
      ...next,
      amount: calculateAmount({ qty: next.qty, exPrice: next.exPrice }),
      projectedStock,
      recommendedQty,
      severity:
        projectedStock < 0
          ? "critical"
          : projectedStock < next.targetStock
            ? "warning"
            : "healthy",
    };

    if (
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      conflictReturnRef.current = document.activeElement;
    }

    setPlan((current) => ({
      ...current,
      rows: current.rows.map((item) =>
        item.planLineId === planLineId ? updatedRow : item,
      ),
    }));

    autosave.queueSave(
      updatedRow.purchaseLineId
        ? {
            purchaseLines: [
              {
                id: updatedRow.purchaseLineId,
                qty: updatedRow.qty,
                focQty: updatedRow.focQty,
                exPrice: updatedRow.exPrice,
              },
            ],
          }
        : {
            purchaseProposals: [
              {
                productId: updatedRow.productId,
                qty: updatedRow.qty,
                focQty: updatedRow.focQty,
                exPrice: updatedRow.exPrice,
              },
            ],
          },
    );
  }

  function createProposal(row: PlanningRowView) {
    setSelectedPlanLineId(row.planLineId);
    setMobileView("detail");
    updateRow(row.planLineId, { qty: row.recommendedQty });
  }

  function getExceptionFlags() {
    return {
      criticalShortage: plan.rows.some((row) => row.severity === "critical"),
    };
  }

  async function requestApprovalRoute() {
    setApprovalLoading(true);
    setApprovalError(null);
    try {
      const flags = getExceptionFlags();
      if (previewApproval) {
        setApprovalRoute(await previewApproval(flags));
        return;
      }

      const response = await fetch(`/api/planning/${plan.version.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview", exceptionFlags: flags }),
      });
      if (!response.ok) throw new Error("approval_preview_failed");
      const payload = (await response.json()) as { route: ApprovalRoute };
      setApprovalRoute(payload.route);
    } catch {
      setApprovalError("Không thể kiểm tra luồng duyệt. Vui lòng thử lại.");
    } finally {
      setApprovalLoading(false);
    }
  }

  async function confirmApprovalSubmission() {
    setApprovalLoading(true);
    setApprovalError(null);
    try {
      const flags = getExceptionFlags();
      if (submitApproval) {
        await submitApproval(flags);
        setApprovalRoute(null);
        return;
      }

      const response = await fetch(`/api/planning/${plan.version.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          exceptionFlags: flags,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("approval_submit_failed");
      window.location.reload();
    } catch {
      setApprovalError("Không thể gửi duyệt. Kế hoạch chưa bị thay đổi.");
    } finally {
      setApprovalLoading(false);
    }
  }

  function closeApprovalRoute() {
    setApprovalRoute(null);
    queueMicrotask(() => approvalTriggerRef.current?.focus());
  }

  function closeConflict() {
    autosave.dismissConflict();
    queueMicrotask(() => {
      const previous = conflictReturnRef.current;
      const previousDisabled =
        previous instanceof HTMLButtonElement && previous.disabled;
      if (previous?.isConnected && previous !== document.body && !previousDisabled) {
        previous.focus();
        return;
      }
      document.querySelector<HTMLElement>('[aria-label="Số lượng đặt"]')?.focus();
    });
  }

  return (
    <div className="planning-workspace">
      <PlanningHeader
        plan={plan}
        saveLabel={saveLabels[autosave.status]}
        viewerCount={viewerCount}
      />
      <PlanningWorkflowNav
        step={activeWorkflowStep}
        basePath={workflowBasePath ?? `/planning/${plan.cycle.id}`}
        brandId={workflowBrandId}
        versionId={plan.version.id}
      />
      <KpiStrip plan={plan} />
      {activeWorkflowStep === "products" && priorityAlert ? (
        <StockAlert
          row={priorityAlert}
          canEdit={plan.canEdit}
          onCreateProposal={createProposal}
        />
      ) : null}
      {activeWorkflowStep === "products" ? (
        <div
          className="planning-workspace__detail"
          data-planning-view={mobileView}
        >
          <PlanningProductList
            rows={plan.rows}
            selectedPlanLineId={selectedPlanLineId}
            onSelect={(planLineId) => {
              setSelectedPlanLineId(planLineId);
              setMobileView("detail");
            }}
          />
          <PlanningProductEditor
            row={selectedRow}
            canEdit={plan.canEdit}
            currencyCode={plan.cycle.currencyCode}
            onChange={updateRow}
            onApplyRecommendation={createProposal}
            onBack={() => setMobileView("list")}
          />
        </div>
      ) : null}
      {activeWorkflowStep === "po" ? (
        <PoTimeline
          currencyCode={plan.cycle.currencyCode}
          batches={[...poBatches]}
        />
      ) : null}
      {activeWorkflowStep === "budget" ? (
        <section className="planning-step-summary" aria-labelledby="planning-budget-title">
          <p className="section-index">Bước 3</p>
          <h2 id="planning-budget-title">Ngân sách</h2>
          <dl className="planning-step-summary__metrics">
            <div><dt>Đã lên PO</dt><dd>{money.format(committedAmount)}</dd></div>
            <div><dt>Ngân sách còn lại</dt><dd>{money.format(remainingBudget)}</dd></div>
          </dl>
          <p>
            {remainingBudget < 0
              ? "Kế hoạch hiện vượt ngân sách mục tiêu; cần điều chỉnh trước khi gửi duyệt."
              : "Kế hoạch đang trong ngân sách mục tiêu."}
          </p>
        </section>
      ) : null}
      {activeWorkflowStep === "submit" ? (
        <section className="planning-submit-summary" aria-labelledby="planning-submit-title">
          <div>
            <p className="section-index">Bước 4</p>
            <h2 id="planning-submit-title">Gửi duyệt kế hoạch</h2>
            <p>Kiểm tra rủi ro và ngân sách trước khi xem tuyến duyệt đang áp dụng.</p>
          </div>
          <dl className="planning-submit-summary__checks">
            <div>
              <dt>Sản phẩm khẩn cấp</dt>
              <dd>{unresolvedCriticalCount} sản phẩm khẩn cấp chưa xử lý</dd>
            </div>
            <div>
              <dt>Ngân sách</dt>
              <dd>{remainingBudget < 0 ? `Vượt ${money.format(Math.abs(remainingBudget))}` : `Còn lại ${money.format(remainingBudget)}`}</dd>
            </div>
            <div>
              <dt>Luồng duyệt</dt>
              <dd>Chưa kiểm tra</dd>
            </div>
          </dl>
          <div className="planning-approval-toolbar">
            <div>
              <strong>Sẵn sàng gửi duyệt?</strong>
              <span>Hệ thống sẽ hiển thị đúng luồng duyệt đang áp dụng trước khi gửi.</span>
            </div>
            <button
              ref={approvalTriggerRef}
              className="button button--primary"
              type="button"
              disabled={!plan.canEdit || approvalLoading}
              onClick={requestApprovalRoute}
            >
              {approvalLoading ? "Đang kiểm tra…" : "Kiểm tra & gửi duyệt"}
            </button>
          </div>
        </section>
      ) : null}
      {approvalError ? (
        <div className="form-alert form-alert--error" role="alert">
          {approvalError}
        </div>
      ) : null}
      {autosave.error ? (
        <div className="form-alert form-alert--error" role="alert">
          {autosave.error}
        </div>
      ) : null}
      {autosave.conflict ? (
        <div
          className="planning-conflict"
          role="dialog"
          aria-modal="true"
          aria-labelledby="planning-conflict-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeConflict();
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
          <div className="planning-conflict__panel">
            <p className="section-index">Cần quyết định</p>
            <h2 id="planning-conflict-title">Xung đột phiên bản</h2>
            <p>{autosave.conflict.message}</p>
            <p className="muted-copy">
              Bản local của bạn vẫn được giữ nguyên. Hãy tải phiên bản mới để
              so sánh trước khi tiếp tục.
            </p>
            <div>
              <button
                ref={conflictKeepLocalRef}
                className="button"
                type="button"
                onClick={closeConflict}
              >
                Giữ bản local
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => window.location.reload()}
              >
                Tải phiên bản mới
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {approvalRoute ? (
        <SubmitPlanDialog
          open
          route={approvalRoute}
          onCancel={closeApprovalRoute}
          onConfirm={confirmApprovalSubmission}
        />
      ) : null}
    </div>
  );
}
