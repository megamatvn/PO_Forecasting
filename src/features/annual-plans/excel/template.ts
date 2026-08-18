import ExcelJS from "exceljs";

export const ANNUAL_PLAN_TEMPLATE_VERSION = "SAGEN_PURCHASE_PLAN_V2_1" as const;
export const ANNUAL_PLAN_SCHEMA_ID = "sagen.purchase-plan.annual.v2" as const;
export const annualPlanBusinessSheets = ["Kế hoạch SKU", "Phân bổ PO"] as const;

export interface ExcelTemplateBrand { id: string; code: string; name: string }
export interface ExcelTemplateLine { productId: string | null; sku: string; name: string; exPrice: string; paidQty: number; expectedFoc: number; openingStock: number }
export interface ExcelTemplateAllocation { productId: string | null; sku: string; paidQty: number; focQty: number; exPrice: string }
export interface ExcelTemplateWave { id: string; sequence: number; orderMonth: string; arrivalMonth: string; allocations: ExcelTemplateAllocation[] }
export interface ExcelTemplateContext { revisionId: string; lockVersion: number; brand: ExcelTemplateBrand; planningYear: number; lines: ExcelTemplateLine[]; waves: ExcelTemplateWave[] }

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D1C19" } };
  row.alignment = { vertical: "middle" };
}

export async function createAnnualPlanExcelTemplate(context: ExcelTemplateContext): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sagen Groupe";
  const skuSheet = workbook.addWorksheet("Kế hoạch SKU");
  const waveSheet = workbook.addWorksheet("Phân bổ PO");
  const metadata = workbook.addWorksheet("__SAGEN_META", { state: "veryHidden" });
  metadata.getCell("A1").value = "key";
  metadata.getCell("B1").value = "value";
  const metadataEntries: Array<[string, string | number]> = [
    ["templateVersion", ANNUAL_PLAN_TEMPLATE_VERSION], ["schemaId", ANNUAL_PLAN_SCHEMA_ID],
    ["revisionId", context.revisionId], ["lockVersion", context.lockVersion], ["brandId", context.brand.id],
    ["brandCode", context.brand.code], ["brandName", context.brand.name], ["planningYear", context.planningYear],
    ["generatedAt", new Date().toISOString()],
  ];
  metadataEntries.forEach(([key, value], index) => { metadata.getCell(index + 2, 1).value = key; metadata.getCell(index + 2, 2).value = value; });

  const skuHeaders = ["SKU", "Tên sản phẩm", "Đơn giá xuất khẩu (Ex Price)", "Số lượng mua", "FOC dự kiến", "Tồn đầu kỳ"];
  skuSheet.addRow(skuHeaders); styleHeader(skuSheet.getRow(1)); skuSheet.views = [{ state: "frozen", ySplit: 1 }];
  skuSheet.columns = [{ width: 18 }, { width: 34 }, { width: 25 }, { width: 18 }, { width: 16 }, { width: 18 }];
  context.lines.forEach((line) => skuSheet.addRow([line.sku, line.name, line.exPrice, line.paidQty, line.expectedFoc, line.openingStock]));
  skuSheet.autoFilter = { from: "A1", to: `F${Math.max(1, context.lines.length + 1)}` };
  skuSheet.eachRow((row, rowNumber) => { if (rowNumber > 1) row.getCell(3).numFmt = "0.000000"; });

  const waveHeaders = ["Mã PO", "Tháng đặt", "Tháng hàng về", "SKU", "Số lượng", "FOC"];
  waveSheet.addRow(waveHeaders); styleHeader(waveSheet.getRow(1)); waveSheet.views = [{ state: "frozen", ySplit: 1 }];
  waveSheet.columns = [{ width: 18 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 14 }];
  context.waves.forEach((wave) => wave.allocations.forEach((allocation) => waveSheet.addRow([`PO #${wave.sequence}`, wave.orderMonth, wave.arrivalMonth, allocation.sku, allocation.paidQty, allocation.focQty])));
  waveSheet.autoFilter = { from: "A1", to: `F${Math.max(1, context.waves.reduce((count, wave) => count + wave.allocations.length, 0) + 1)}` };
  [skuSheet, waveSheet].forEach((sheet) => sheet.eachRow((row) => row.eachCell((cell) => { cell.protection = { locked: false }; })));
  metadata.state = "veryHidden";
  return (await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer;
}

export const createPurchasePlanTemplate = createAnnualPlanExcelTemplate;
