import { describe, expect, it } from "vitest";
import { projectPlan } from "@/features/planning/domain/project-plan";
import {
  buildStockAlerts,
  recommendPurchase,
} from "@/features/planning/domain/recommend-po";

describe("recommendPurchase", () => {
  it("proposes at least 2,368 units for active ET-015150", () => {
    const projection = projectPlan({
      openingStock: 32,
      targetStock: 0,
      monthlyDemand: [400, 400, 400, 600, 600],
      receipts: [],
    });

    expect(recommendPurchase(projection, 0)).toEqual({
      minimumQty: 2368,
      recommendedQty: 2368,
      firstShortageMonth: "M1",
      severity: "critical",
    });
  });

  it("marks a non-negative safety-stock gap as warning", () => {
    const projection = projectPlan({
      openingStock: 10,
      targetStock: 20,
      monthlyDemand: [0],
      monthLabels: ["2026-08"],
      receipts: [],
    });

    expect(recommendPurchase(projection, 20)).toMatchObject({
      minimumQty: 10,
      recommendedQty: 10,
      firstShortageMonth: "2026-08",
      severity: "warning",
    });
  });

  it("builds explicit stock alerts instead of relying on color alone", () => {
    const projection = projectPlan({
      openingStock: 0,
      targetStock: 0,
      monthlyDemand: [5],
      receipts: [],
    });

    expect(buildStockAlerts(projection, 0)).toEqual([
      {
        month: "M1",
        shortage: 5,
        severity: "critical",
        label: "Critical",
        message: "Thiếu tối thiểu 5 sản phẩm tại M1.",
      },
    ]);
  });
});
