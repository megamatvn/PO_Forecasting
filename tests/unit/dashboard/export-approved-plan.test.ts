import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildApprovedPlanFilename,
  exportApprovedPlanWorkbook,
} from "@/features/dashboard/server/export-approved-plan";

describe("approved plan export", () => {
  it("uses the Sagen filename contract and sanitizes brand labels", () => {
    expect(buildApprovedPlanFilename("ETX / Etiaxil", 2026)).toBe(
      "Sagen_ETX-Etiaxil_2026_Ke_hoach_mua_hang.xlsx",
    );
  });

  it("recalculates Amount from paid quantity × Ex Price", async () => {
    const buffer = await exportApprovedPlanWorkbook({
      brandCode: "ETX",
      brandName: "Etiaxil",
      planningYear: 2026,
      currencyCode: "EUR",
      revisionNumber: 3,
      lines: [{
        sku: "ET-015025",
        productName: "Đặc trị xanh",
        openingStock: 10,
        annualPaidQty: 100,
        annualFocQty: 20,
        exPrice: "2.50",
        providedAmount: "999999.99",
      }],
      waves: [{
        waveNumber: 1,
        officialPoNumber: "PO-2026-001",
        status: "ordered",
        orderMonth: "2026-01",
        arrivalMonth: "2026-02",
        lines: [{ sku: "ET-015025", paidQty: 40, focQty: 5, exPrice: "2.50", providedAmount: "0" }],
      }],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Kế hoạch đã duyệt");

    expect(sheet?.getCell("H2").value).toBe(250);
    expect(sheet?.getCell("H2").value).not.toBe(999999.99);
    expect(workbook.getWorksheet("Đợt mua")?.getCell("J2").value).toBe(100);
  });
});
