import ExcelJS from "exceljs";

export interface ApprovedPlanExportLine {
  sku: string;
  productName: string;
  openingStock: number;
  annualPaidQty: number;
  annualFocQty: number;
  exPrice: string;
  /** Kept in the input contract to make it explicit that the server ignores it. */
  providedAmount?: string | number | null;
}

export interface ApprovedPlanExportWaveLine {
  sku: string;
  paidQty: number;
  focQty: number;
  exPrice: string;
  providedAmount?: string | number | null;
}

export interface ApprovedPlanExportWave {
  waveNumber: number;
  officialPoNumber: string | null;
  status: string;
  orderMonth: string;
  arrivalMonth: string;
  lines: ApprovedPlanExportWaveLine[];
}

export interface ApprovedPlanExportInput {
  brandCode: string;
  brandName: string;
  planningYear: number;
  currencyCode: string;
  revisionNumber: number;
  lines: ApprovedPlanExportLine[];
  waves: ApprovedPlanExportWave[];
}

function amount(paidQty: number, exPrice: string): number {
  return Number((Math.max(0, paidQty) * Math.max(0, Number(exPrice))).toFixed(2));
}

function safeSegment(value: string): string {
  return value.trim().replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff_-]+/gi, "-").replace(/^-+|-+$/g, "") || "Ke-hoach";
}

export function buildApprovedPlanFilename(brand: string, planningYear: number): string {
  return `Sagen_${safeSegment(brand)}_${planningYear}_Ke_hoach_mua_hang.xlsx`;
}

export async function exportApprovedPlanWorkbook(input: ApprovedPlanExportInput): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sagen · Kế hoạch mua hàng";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const plan = workbook.addWorksheet("Kế hoạch đã duyệt", { views: [{ state: "frozen", ySplit: 1 }] });
  plan.columns = [
    { header: "SKU", key: "sku", width: 18 },
    { header: "Sản phẩm", key: "productName", width: 34 },
    { header: "Tồn đầu kỳ", key: "openingStock", width: 15 },
    { header: "Qty cả năm", key: "annualPaidQty", width: 15 },
    { header: "FOC cả năm", key: "annualFocQty", width: 15 },
    { header: "Ex Price", key: "exPrice", width: 14 },
    { header: "Tiền tệ", key: "currencyCode", width: 10 },
    { header: "Amount", key: "amount", width: 16 },
  ];
  for (const line of input.lines) {
    plan.addRow({ sku: line.sku, productName: line.productName, openingStock: line.openingStock, annualPaidQty: line.annualPaidQty, annualFocQty: line.annualFocQty, exPrice: Number(line.exPrice), currencyCode: input.currencyCode, amount: amount(line.annualPaidQty, line.exPrice) });
  }

  const waves = workbook.addWorksheet("Đợt mua");
  waves.columns = [
    { header: "PO #", key: "waveNumber", width: 10 },
    { header: "Số PO chính thức", key: "officialPoNumber", width: 22 },
    { header: "Trạng thái", key: "status", width: 22 },
    { header: "Tháng đặt", key: "orderMonth", width: 14 },
    { header: "Tháng hàng về", key: "arrivalMonth", width: 16 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Qty", key: "paidQty", width: 12 },
    { header: "FOC", key: "focQty", width: 12 },
    { header: "Ex Price", key: "exPrice", width: 14 },
    { header: "Amount", key: "amount", width: 16 },
  ];
  for (const wave of input.waves) {
    for (const line of wave.lines) {
      waves.addRow({ waveNumber: wave.waveNumber, officialPoNumber: wave.officialPoNumber ?? "", status: wave.status, orderMonth: wave.orderMonth, arrivalMonth: wave.arrivalMonth, sku: line.sku, paidQty: line.paidQty, focQty: line.focQty, exPrice: Number(line.exPrice), amount: amount(line.paidQty, line.exPrice) });
    }
  }

  const metadata = workbook.addWorksheet("Thông tin");
  metadata.columns = [{ header: "Thuộc tính", key: "key", width: 28 }, { header: "Giá trị", key: "value", width: 48 }];
  metadata.addRows([
    { key: "Nhãn hàng", value: `${input.brandCode} · ${input.brandName}` },
    { key: "Năm kế hoạch", value: input.planningYear },
    { key: "Phiên bản", value: input.revisionNumber },
    { key: "Trạng thái", value: "Đã duyệt" },
    { key: "Quy tắc Amount", value: "Qty × Ex Price; FOC không tính vào Amount" },
    { key: "Nguồn", value: "Sagen · Dữ liệu baseline đã duyệt" },
  ]);

  for (const sheet of [plan, waves, metadata]) {
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0F6B4F" } };
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.alignment = { vertical: "middle" };
    });
    sheet.getRow(1).height = 26;
    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + sheet.columnCount)}1` };
  }
  plan.getColumn("exPrice").numFmt = "#,##0.00";
  plan.getColumn("amount").numFmt = "#,##0.00";
  plan.getColumn("openingStock").numFmt = "#,##0";
  plan.getColumn("annualPaidQty").numFmt = "#,##0";
  plan.getColumn("annualFocQty").numFmt = "#,##0";
  waves.getColumn("exPrice").numFmt = "#,##0.00";
  waves.getColumn("amount").numFmt = "#,##0.00";
  waves.getColumn("paidQty").numFmt = "#,##0";
  waves.getColumn("focQty").numFmt = "#,##0";
  return workbook.xlsx.writeBuffer();
}
