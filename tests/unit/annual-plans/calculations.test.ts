import { describe, expect, it } from "vitest";
import { calculateAnnualLine, summarizeAllocations } from "@/features/annual-plans/domain/calculations";

describe("annual-plan calculations", () => {
  it("uses paid quantity only for Amount and includes FOC in total receipts", () => {
    expect(calculateAnnualLine({ exPrice: "1.75", paidQty: 10511, expectedFoc: 250, openingStock: 1790 })).toEqual({ totalReceipts: 10761, plannedAmount: "18394.25" });
  });

  it("summarizes allocations by product without floating point drift", () => {
    expect(summarizeAllocations([
      { productId: "p1", paidQty: 10, focQty: 2, exPrice: "1.10" },
      { productId: "p1", paidQty: 5, focQty: 1, exPrice: "1.10" },
    ])).toEqual({ p1: { paidQty: 15, focQty: 3, amount: "16.50" } });
  });
});
