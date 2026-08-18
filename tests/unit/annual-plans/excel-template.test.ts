import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { ANNUAL_PLAN_SCHEMA_ID, ANNUAL_PLAN_TEMPLATE_VERSION, createAnnualPlanExcelTemplate } from "@/features/annual-plans/excel/template";
import { fixtureTemplateContext } from "../../fixtures/purchase-planning-v2-workbook";

describe("annual plan Excel template", () => {
  it("creates exactly two visible business sheets and hidden Sagen metadata", async () => {
    const buffer = await createAnnualPlanExcelTemplate(fixtureTemplateContext());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets.filter((sheet) => sheet.state === "visible").map((sheet) => sheet.name)).toEqual(["Kế hoạch SKU", "Phân bổ PO"]);
    expect(workbook.getWorksheet("__SAGEN_META")?.state).toBe("veryHidden");
    expect(workbook.getWorksheet("__SAGEN_META")?.getCell("B2").value).toBe(ANNUAL_PLAN_TEMPLATE_VERSION);
    expect(workbook.getWorksheet("__SAGEN_META")?.getCell("B3").value).toBe(ANNUAL_PLAN_SCHEMA_ID);
  });

  it("writes SKU and PO rows in the stable non-dynamic-column format", async () => {
    const buffer = await createAnnualPlanExcelTemplate(fixtureTemplateContext());
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet("Kế hoạch SKU")?.getRow(1).values).toEqual([, "SKU", "Tên sản phẩm", "Đơn giá xuất khẩu (Ex Price)", "Số lượng mua", "FOC dự kiến", "Tồn đầu kỳ"]);
    expect(workbook.getWorksheet("Phân bổ PO")?.getRow(2).values).toEqual([, "PO #1", "2026-03", "2026-04", "ET-015025", 100, 20]);
  });
});
