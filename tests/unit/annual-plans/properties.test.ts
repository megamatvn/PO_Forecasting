import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { calculateAnnualLine } from "@/features/annual-plans/domain/calculations";

describe("annual-plan calculation invariants", () => {
  it("preserves paid plus FOC for nonnegative inputs", () => {
    fc.assert(fc.property(fc.nat({ max: 100_000 }), fc.nat({ max: 100_000 }), (paidQty, focQty) => {
      expect(calculateAnnualLine({ exPrice: "0", paidQty, expectedFoc: focQty, openingStock: 0 }).totalReceipts).toBe(paidQty + focQty);
    }));
  });
});
