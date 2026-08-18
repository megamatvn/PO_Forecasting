import { describe, expect, it } from "vitest";
import { buildDashboardInsights } from "@/features/reports/domain/dashboard-insights";
import type { PlanningRowView } from "@/features/planning/planning-types";
import type {
  DashboardKpiView,
  PoTimelineItem,
} from "@/features/reports/report-types";

function row(
  planLineId: string,
  sku: string,
  recommendedQty: number,
  severity: PlanningRowView["severity"],
): PlanningRowView {
  return {
    planLineId,
    purchaseLineId: null,
    productId: `product-${planLineId}`,
    sku,
    productName: `Sản phẩm ${sku}`,
    openingStock: 0,
    targetStock: 0,
    annualDemand: recommendedQty,
    qty: 0,
    focQty: 0,
    exPrice: "1.00",
    amount: "0.00",
    projectedStock: -recommendedQty,
    recommendedQty,
    severity,
  };
}

const kpis: DashboardKpiView = {
  targetAmount: 100,
  committedAmount: 125,
  gapAmount: -25,
  criticalCount: 2,
  actionableSkuCount: 6,
  poCount: 4,
};

describe("buildDashboardInsights", () => {
  it("orders actionable products by severity then shortage and limits the queue to five", () => {
    const insights = buildDashboardInsights(
      [
        row("warning-large", "ET-WARNING-LARGE", 500, "warning"),
        row("critical-small", "ET-CRITICAL-SMALL", 100, "critical"),
        row("healthy", "ET-HEALTHY", 0, "healthy"),
        row("warning-small", "ET-WARNING-SMALL", 50, "warning"),
        row("critical-large", "ET-CRITICAL-LARGE", 200, "critical"),
        row("warning-third", "ET-WARNING-THIRD", 30, "warning"),
        row("warning-fourth", "ET-WARNING-FOURTH", 20, "warning"),
      ],
      [],
      kpis,
    );

    expect(insights.totalRecommendedQty).toBe(900);
    expect(insights.topPriorityRows).toHaveLength(5);
    expect(insights.topPriorityRows.map((item) => item.sku)).toEqual([
      "ET-CRITICAL-LARGE",
      "ET-CRITICAL-SMALL",
      "ET-WARNING-LARGE",
      "ET-WARNING-SMALL",
      "ET-WARNING-THIRD",
    ]);
  });

  it("counts active supply statuses and finds the nearest non-cancelled ETA", () => {
    const batches: PoTimelineItem[] = [
      {
        id: "planned",
        batchNumber: 1,
        name: "Đợt mua 1",
        orderDate: "2026-08-10",
        etaDate: "2026-09-20",
        status: "planned",
        amount: 10,
        lineCount: 1,
      },
      {
        id: "confirmed",
        batchNumber: 2,
        name: "Đợt mua 2",
        orderDate: "2026-08-11",
        etaDate: "2026-08-20",
        status: "confirmed",
        amount: 20,
        lineCount: 2,
      },
      {
        id: "cancelled",
        batchNumber: 3,
        name: "Đợt đã hủy",
        orderDate: "2026-08-01",
        etaDate: "2026-08-15",
        status: "cancelled",
        amount: 30,
        lineCount: 3,
      },
    ];

    const insights = buildDashboardInsights([], batches, kpis);

    expect(insights.nextEtaDate).toBe("2026-08-20");
    expect(insights.batchStatusCounts).toEqual({
      planned: 1,
      submitted: 0,
      confirmed: 1,
      received: 0,
    });
  });

  it("keeps the real utilization above target and safely handles a zero target", () => {
    expect(buildDashboardInsights([], [], kpis).budgetUtilization).toBe(125);
    expect(
      buildDashboardInsights([], [], {
        ...kpis,
        targetAmount: 0,
        committedAmount: 0,
        gapAmount: 0,
      }).budgetUtilization,
    ).toBe(0);
  });
});
