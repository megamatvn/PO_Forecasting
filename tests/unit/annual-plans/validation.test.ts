import { describe, expect, it } from "vitest";
import { validateAnnualLinesStep, validatePurchaseWavesStep, validateScopeStep } from "@/features/annual-plans/domain/validation";

const productId = "90000000-0000-4000-8000-000000000101";

describe("annual-plan step validation", () => {
  it("allows current and future scope years but rejects the past", () => {
    expect(validateScopeStep({ brandId: productId, planningYear: 2026, currentYear: 2026 }).valid).toBe(true);
    expect(validateScopeStep({ brandId: productId, planningYear: 2025, currentYear: 2026 }).errors).toContain("Năm kế hoạch không được ở trong quá khứ.");
  });

  it("rejects duplicate SKU lines and negative commercial values", () => {
    const result = validateAnnualLinesStep([
      { productId, exPrice: "1.75", paidQty: 1, expectedFoc: 0, openingStock: 0 },
      { productId, exPrice: "-1", paidQty: -1, expectedFoc: 0, openingStock: 0 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("SKU bị lặp");
    expect(result.errors.join(" ")).toContain("không âm");
  });

  it("requires every annual paid and FOC unit to be allocated exactly once", () => {
    const result = validatePurchaseWavesStep(
      [{ productId, exPrice: "1.75", paidQty: 10, expectedFoc: 2, openingStock: 0 }],
      [{ waveId: "wave-1", waveNumber: 1, orderMonth: "2026-03", arrivalMonth: "2026-04", allocations: [{ productId, paidQty: 9, focQty: 2, exPrice: "1.75" }] }],
      2026,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tổng số lượng phân bổ phải bằng số lượng mua cả năm.");
    expect(result.fieldErrors["lines.0.paidQty"]).toContain("Tổng số lượng phân bổ phải bằng số lượng mua cả năm.");
    expect(result.summary.some((item) => item.code === "paid_qty_mismatch")).toBe(true);
  });

  it("rejects an allocation month that moves backwards by wave number", () => {
    const result = validatePurchaseWavesStep(
      [{ productId, exPrice: "1.75", paidQty: 10, expectedFoc: 0, openingStock: 0 }],
      [
        { waveId: "wave-1", waveNumber: 1, orderMonth: "2026-06", arrivalMonth: "2026-06", allocations: [{ productId, paidQty: 5, focQty: 0, exPrice: "1.75" }] },
        { waveId: "wave-2", waveNumber: 2, orderMonth: "2026-03", arrivalMonth: "2026-03", allocations: [{ productId, paidQty: 5, focQty: 0, exPrice: "1.75" }] },
      ],
      2026,
    );
    expect(result.valid).toBe(false);
    expect(result.summary.some((item) => item.code === "month_order")).toBe(true);
  });
});
