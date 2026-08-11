import { describe, expect, it } from "vitest";
import { projectPlan } from "@/features/planning/domain/project-plan";

describe("projectPlan", () => {
  it("projects ET-015150 to -2,368 when no future PO exists", () => {
    const result = projectPlan({
      openingStock: 32,
      targetStock: 0,
      monthlyDemand: [400, 400, 400, 600, 600],
      receipts: [],
    });

    expect(result.at(-1)).toMatchObject({
      openingStock: -1768,
      demand: 600,
      receiptQty: 0,
      closingStock: -2368,
      shortage: 2368,
    });
  });

  it("counts FOC as stock receipt and ignores cancelled PO batches", () => {
    const result = projectPlan({
      openingStock: 100,
      targetStock: 0,
      monthlyDemand: [30, 30],
      monthLabels: ["2026-08", "2026-09"],
      receipts: [
        { monthIndex: 0, qty: 0, focQty: 10, isCancelled: false },
        { monthIndex: 1, qty: 100, focQty: 10, isCancelled: true },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({ month: "2026-08", receiptQty: 10, closingStock: 80 }),
      expect.objectContaining({ month: "2026-09", receiptQty: 0, closingStock: 50 }),
    ]);
  });
});
