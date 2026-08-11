import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { exportPlanWorkbook } from "@/features/reports/server/export-plan";

describe("exportPlanWorkbook", () => {
  it("exports canonical SKU and Amount = Qty × Ex Price with metadata", async () => {
    const buffer = await exportPlanWorkbook({
      cycle: {
        id: "cycle-etx",
        code: "ETX-2026",
        name: "ETX Forecast 2026",
        currencyCode: "EUR",
        targetPurchaseAmount: "100000",
      },
      version: {
        id: "41000000-0000-0000-0000-000000000001",
        versionNumber: 4,
        status: "approved",
        lockVersion: 2,
        updatedAt: "2026-08-11T08:30:00.000Z",
      },
      canEdit: false,
      rows: [
        {
          planLineId: "line-et-015150",
          productId: "product-et-015150",
          sku: "ET-015150",
          productName: "Sản phẩm active chưa lên PO",
          openingStock: 1002,
          targetStock: 0,
          annualDemand: 3370,
          qty: 2368,
          focQty: 0,
          exPrice: "12.50",
          amount: "29600.00",
          projectedStock: 0,
          recommendedQty: 0,
          severity: "healthy",
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const forecast = workbook.getWorksheet("Forecast Plan");
    const metadata = workbook.getWorksheet("Metadata");

    expect(forecast?.getCell("A2").value).toBe("ET-015150");
    expect(forecast?.getCell("H2").value).toBe(29600);
    expect(metadata?.getCell("B2").value).toBe("ETX-2026");
    expect(metadata?.getCell("B4").value).toBe("approved");
  });
});
