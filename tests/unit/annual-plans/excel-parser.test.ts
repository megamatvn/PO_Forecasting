import { describe, expect, it } from "vitest";
import { createAnnualPlanExcelTemplate } from "@/features/annual-plans/excel/template";
import { parseAnnualPlanWorkbook } from "@/features/annual-plans/excel/parser";
import { fixtureProduct, fixtureTemplateContext } from "../../fixtures/purchase-planning-v2-workbook";

describe("annual plan Excel parser", () => {
  it("returns a preview without business writes and preserves metadata/checksum", async () => {
    const preview = await parseAnnualPlanWorkbook(await createAnnualPlanExcelTemplate(fixtureTemplateContext()), { expectedBrandId: fixtureProduct.brandId, expectedPlanningYear: 2026, knownSkus: new Set([fixtureProduct.sku]) });
    expect(preview.templateVersion).toBe("SAGEN_PURCHASE_PLAN_V2_1");
    expect(preview.brand.code).toBe("ET");
    expect(preview.planningYear).toBe(2026);
    expect(preview.lines[0]).toMatchObject({ sku: "ET-015025", paidQty: 100, expectedFoc: 20, isNew: false });
    expect(preview.waves[0]).toMatchObject({ sequence: 1, orderMonth: "2026-03", arrivalMonth: "2026-04", allocations: [{ paidQty: 100, focQty: 20 }] });
    expect(preview.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.canApply).toBe(true);
  });

  it("reports localized errors for allocation mismatch and wrong metadata", async () => {
    const preview = await parseAnnualPlanWorkbook(await createAnnualPlanExcelTemplate(fixtureTemplateContext({ planningYear: 2027, waves: [{ ...fixtureTemplateContext().waves[0], allocations: [{ ...fixtureTemplateContext().waves[0].allocations[0], paidQty: 1 }] }] })), { expectedBrandId: "90000000-0000-4000-8000-000000000099", expectedPlanningYear: 2026 });
    expect(preview.canApply).toBe(false);
    expect(preview.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["BRAND_MISMATCH", "YEAR_MISMATCH", "ALLOCATION_MISMATCH"]));
    expect(preview.diagnostics.every((diagnostic) => diagnostic.message.length > 0)).toBe(true);
  });
});
