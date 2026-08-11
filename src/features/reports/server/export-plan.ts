import ExcelJS from "exceljs";
import type { PlanningWorkspaceView } from "@/features/planning/planning-types";

const headerFill = "173F35";
const accentFill = "DDF3EA";

export async function exportPlanWorkbook(
  plan: PlanningWorkspaceView,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sagen PO Forecasting";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const forecast = workbook.addWorksheet("Forecast Plan", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });
  forecast.columns = [
    { header: "SKU", key: "sku", width: 16 },
    { header: "Sản phẩm", key: "productName", width: 34 },
    { header: "Tồn đầu", key: "openingStock", width: 13 },
    { header: "Forecast năm", key: "annualDemand", width: 16 },
    { header: "Qty", key: "qty", width: 13 },
    { header: "FOC", key: "focQty", width: 12 },
    { header: "Ex Price", key: "exPrice", width: 14 },
    { header: "Amount", key: "amount", width: 18 },
    { header: "Tồn dự kiến", key: "projectedStock", width: 16 },
    { header: "Đề xuất bổ sung", key: "recommendedQty", width: 18 },
    { header: "Mức độ", key: "severity", width: 13 },
  ];

  for (const row of plan.rows) {
    forecast.addRow({
      sku: row.sku,
      productName: row.productName,
      openingStock: row.openingStock,
      annualDemand: row.annualDemand,
      qty: row.qty,
      focQty: row.focQty,
      exPrice: Number(row.exPrice),
      // `amount` is the server-loaded aggregate of canonical purchase_lines
      // (whose database generated column enforces Qty × Ex Price). For an
      // Approved version, `qty` is only the editable planned wave and can be
      // zero even when confirmed/received purchase lines have an amount.
      amount: Number(row.amount),
      projectedStock: row.projectedStock,
      recommendedQty: row.recommendedQty,
      severity: row.severity,
    });
  }

  forecast.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerFill } };
    cell.font = { bold: true, color: { argb: "FFFFFF" } };
    cell.alignment = { vertical: "middle" };
  });
  forecast.getRow(1).height = 28;
  forecast.autoFilter = { from: "A1", to: "K1" };
  forecast.getColumn("exPrice").numFmt = "#,##0.00";
  forecast.getColumn("amount").numFmt = "#,##0.00";
  forecast.getColumn("qty").numFmt = "#,##0";
  forecast.getColumn("focQty").numFmt = "#,##0";
  forecast.getColumn("openingStock").numFmt = "#,##0";
  forecast.getColumn("annualDemand").numFmt = "#,##0";
  forecast.getColumn("projectedStock").numFmt = "#,##0";
  forecast.getColumn("recommendedQty").numFmt = "#,##0";

  const metadata = workbook.addWorksheet("Metadata");
  metadata.columns = [
    { header: "Thuộc tính", key: "field", width: 26 },
    { header: "Giá trị", key: "value", width: 42 },
  ];
  metadata.addRows([
    { field: "Planning cycle", value: plan.cycle.code },
    { field: "Version", value: plan.version.versionNumber },
    { field: "Status", value: plan.version.status },
    { field: "Currency", value: plan.cycle.currencyCode },
    { field: "Version ID", value: plan.version.id },
    { field: "Cập nhật lúc", value: plan.version.updatedAt },
    { field: "Quy tắc Amount", value: "Qty × Ex Price (không gồm FOC)" },
    { field: "Nguồn", value: "Sagen PO Forecasting · canonical database" },
  ]);
  metadata.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerFill } };
    cell.font = { bold: true, color: { argb: "FFFFFF" } };
  });
  metadata.getColumn(1).eachCell((cell, rowNumber) => {
    if (rowNumber > 1) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accentFill } };
      cell.font = { bold: true };
    }
  });

  return workbook.xlsx.writeBuffer();
}
