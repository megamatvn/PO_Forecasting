import type { PlanningRowView } from "@/features/planning/planning-types";
import type {
  DashboardBatchStatusCounts,
  DashboardInsightView,
  DashboardKpiView,
  PoTimelineItem,
} from "@/features/reports/report-types";

const severityRank: Record<PlanningRowView["severity"], number> = {
  critical: 0,
  warning: 1,
  healthy: 2,
};

export function buildDashboardInsights(
  rows: PlanningRowView[],
  batches: PoTimelineItem[],
  kpis: DashboardKpiView,
): DashboardInsightView {
  const actionableRows = rows.filter((row) => row.recommendedQty > 0);
  const topPriorityRows = actionableRows
    .toSorted((left, right) => {
      const severityDifference =
        severityRank[left.severity] - severityRank[right.severity];
      return severityDifference || right.recommendedQty - left.recommendedQty;
    })
    .slice(0, 5)
    .map(({ planLineId, sku, productName, recommendedQty, severity }) => ({
      planLineId,
      sku,
      productName,
      recommendedQty,
      severity,
    }));

  const activeBatches = batches.filter((batch) => batch.status !== "cancelled");
  const batchStatusCounts: DashboardBatchStatusCounts = {
    planned: 0,
    submitted: 0,
    confirmed: 0,
    received: 0,
  };
  for (const batch of activeBatches) {
    if (batch.status !== "cancelled") {
      batchStatusCounts[batch.status] += 1;
    }
  }

  const nextEtaDate = activeBatches
    .map((batch) => batch.etaDate)
    .filter(Boolean)
    .toSorted()[0] ?? null;

  return {
    totalRecommendedQty: actionableRows.reduce(
      (total, row) => total + row.recommendedQty,
      0,
    ),
    topPriorityRows,
    batchStatusCounts,
    nextEtaDate,
    budgetUtilization:
      kpis.targetAmount > 0
        ? (kpis.committedAmount / kpis.targetAmount) * 100
        : 0,
  };
}
