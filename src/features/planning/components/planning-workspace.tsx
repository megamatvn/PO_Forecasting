"use client";

import { useState } from "react";
import { KpiStrip } from "@/features/planning/components/kpi-strip";
import { PlanningGrid } from "@/features/planning/components/planning-grid";
import { PlanningHeader } from "@/features/planning/components/planning-header";
import { PlanningInsights } from "@/features/planning/components/planning-insights";
import { StockAlert } from "@/features/planning/components/stock-alert";
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

interface PlanningWorkspaceProps {
  initialPlan: PlanningWorkspaceView;
  saveDraft?: DraftSaver;
  autosaveDelayMs?: number;
  presenceDisplayName?: string;
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
}: PlanningWorkspaceProps) {
  const [plan, setPlan] = useState(initialPlan);
  const autosave = useDraftAutosave({
    planVersionId: plan.version.id,
    initialLockVersion: plan.version.lockVersion,
    save: saveDraft,
    delayMs: autosaveDelayMs,
  });
  const viewerCount = usePlanPresence({
    planVersionId: plan.version.id,
    displayName: presenceDisplayName,
  });
  const priorityAlert = plan.rows
    .filter((row) => row.severity === "critical" && row.recommendedQty > 0)
    .sort((left, right) => right.recommendedQty - left.recommendedQty)[0];

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
    updateRow(row.planLineId, { qty: row.recommendedQty });
  }

  return (
    <div className="planning-workspace">
      <PlanningHeader
        plan={plan}
        saveLabel={saveLabels[autosave.status]}
        viewerCount={viewerCount}
      />
      <KpiStrip plan={plan} />
      {priorityAlert ? (
        <StockAlert
          row={priorityAlert}
          canEdit={plan.canEdit}
          onCreateProposal={createProposal}
        />
      ) : null}
      <div className="planning-workspace__detail">
        <PlanningGrid
          rows={plan.rows}
          canEdit={plan.canEdit}
          onRowChange={updateRow}
        />
        <PlanningInsights rows={plan.rows} />
      </div>
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
                className="button"
                type="button"
                onClick={autosave.dismissConflict}
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
    </div>
  );
}
