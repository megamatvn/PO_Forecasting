import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import type {
  RawMonthlyDemand,
  RawForecastRow,
  RawPurchaseReceipt,
  RawPurchaseWave,
} from "@/features/imports/domain/import-types";

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const FORECAST_SHEET = "Forecast 5M";
const FIRST_DATA_ROW = 7;

const purchaseWaveColumns = [
  { waveNumber: 1, qty: 12, focQty: 13, amount: 14 },
  { waveNumber: 2, qty: 15, focQty: 16, amount: 17 },
  { waveNumber: 3, qty: 21, focQty: 22, amount: 23 },
  { waveNumber: 4, qty: 24, focQty: 25, amount: 26 },
  { waveNumber: 5, qty: 27, focQty: 28, amount: 29 },
  { waveNumber: 6, qty: 30, focQty: 31, amount: 32 },
] as const;

export function assertImportFile(
  fileName: string,
  size: number,
  maxBytes = MAX_IMPORT_BYTES,
): void {
  const normalizedName = fileName.trim().toLowerCase();

  if (normalizedName.endsWith(".xlsm")) {
    throw new Error("Không hỗ trợ file Excel có macro (.xlsm).");
  }

  if (!normalizedName.endsWith(".xlsx")) {
    throw new Error("Chỉ hỗ trợ file Excel định dạng .xlsx.");
  }

  if (size <= 0 || size > maxBytes) {
    throw new Error("Kích thước file Excel không hợp lệ hoặc vượt quá 25 MB.");
  }
}

function scalarValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    if ("result" in value) {
      return value.result ?? null;
    }

    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }

    if ("text" in value) {
      return value.text;
    }
  }

  return value;
}

function textFromCell(cell: ExcelJS.Cell): string {
  const value = scalarValue(cell.value);
  return value === null ? "" : String(value).trim();
}

function numberFromCell(cell: ExcelJS.Cell): number | null {
  const value = scalarValue(cell.value);

  if (value === null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function cellHasValue(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  if (value === null || value === undefined || value === "") return false;
  // A formula with a missing cached result is not an intentional blank. Keep
  // it invalid so the import cannot silently turn an unresolved formula into 0.
  return true;
}

function numberWithValidity(cell: ExcelJS.Cell): { value: number; invalid: boolean } {
  if (!cellHasValue(cell)) return { value: 0, invalid: false };
  const value = numberFromCell(cell);
  return { value: value ?? 0, invalid: value === null };
}

function decimalFromCell(cell: ExcelJS.Cell): string | null {
  const value = numberFromCell(cell);
  return value === null ? null : new Decimal(value).toFixed(2);
}

function isoDateFromCell(cell: ExcelJS.Cell): string | null {
  const value = scalarValue(cell.value);
  if (value === null || value === "") return null;

  const date = value instanceof Date
    ? value
    : typeof value === "number"
      ? new Date(Date.UTC(1899, 11, 30) + value * 86_400_000)
      : new Date(String(value));

  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dateWithValidity(cell: ExcelJS.Cell): { value: string | null; invalid: boolean } {
  if (!cellHasValue(cell)) return { value: null, invalid: false };
  const value = isoDateFromCell(cell);
  return { value, invalid: value === null };
}

function readPurchaseWaves(row: ExcelJS.Row): RawPurchaseWave[] {
  return purchaseWaveColumns.map(({ waveNumber, qty, focQty, amount }) => ({
    waveNumber,
    qty: numberFromCell(row.getCell(qty)) ?? 0,
    focQty: numberFromCell(row.getCell(focQty)) ?? 0,
    importedAmount: decimalFromCell(row.getCell(amount)),
  }));
}

function readSalesDemand(workbook: ExcelJS.Workbook): Map<string, RawMonthlyDemand[]> {
  const sheet = workbook.getWorksheet("Sales");
  const result = new Map<string, RawMonthlyDemand[]>();
  if (!sheet) return result;

  let year = numberFromCell(sheet.getCell("C4"));
  let monthHeaderRow = 5;
  let firstDataRow = 6;

  // Prefer the explicit planning forecast section (for the workbook supplied
  // with this project it is labelled “Sale Forecast 2026”) over the historical
  // actuals table at the top of the sheet.
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const label = textFromCell(sheet.getRow(rowNumber).getCell(3));
    const match = label.match(/forecast\s*(20\d{2})/i);
    if (match) {
      year = Number(match[1]);
      monthHeaderRow = rowNumber + 1;
      firstDataRow = rowNumber + 2;
    }
  }
  if (!year) return result;

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = numberFromCell(sheet.getRow(monthHeaderRow).getCell(5 + index));
    return month && month >= 1 && month <= 12 ? month : null;
  });

  let started = false;
  for (let rowNumber = firstDataRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const sku = textFromCell(row.getCell(3)).toUpperCase();
    if (!sku) {
      if (started) break;
      continue;
    }
    started = true;

    const demand = months.flatMap((month, index) => {
      if (!month) return [];
      const quantity = numberWithValidity(row.getCell(5 + index));
      return [{
        demandMonth: `${year}-${String(month).padStart(2, "0")}-01`,
        demandQty: quantity.value,
        ...(quantity.invalid ? { invalid: true } : {}),
      }];
    });
    if (demand.length) result.set(sku, demand);
  }

  return result;
}

function readPurchaseReceipts(
  workbook: ExcelJS.Workbook,
): Map<string, RawPurchaseReceipt[]> {
  const sheet = workbook.getWorksheet("Purchased");
  const result = new Map<string, RawPurchaseReceipt[]>();
  if (!sheet) return result;

  for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const sku = textFromCell(row.getCell(11)).toUpperCase();
    if (!sku) continue;

    const sourceReference = textFromCell(row.getCell(3)) || `Purchased-${rowNumber}`;
    const statusText = textFromCell(row.getCell(40)).toLowerCase();
    const orderDate = dateWithValidity(row.getCell(1));
    const etaDate = dateWithValidity(row.getCell(2));
    const quantity = numberWithValidity(row.getCell(15));
    const receipt: RawPurchaseReceipt = {
      sourceReference: `${sourceReference}-${rowNumber}`,
      supplierCode: textFromCell(row.getCell(7)) || null,
      supplierName: textFromCell(row.getCell(8)) || null,
      orderDate: orderDate.value,
      etaDate: etaDate.value,
      qty: quantity.value,
      focQty: 0,
      status: statusText.includes("nhập kho") || statusText.includes("đã nhập")
        ? "received"
        : "confirmed",
      ...(quantity.invalid || orderDate.invalid || etaDate.invalid
        ? { invalid: true }
        : {}),
    };
    const existing = result.get(sku) ?? [];
    existing.push(receipt);
    result.set(sku, existing);
  }

  return result;
}

export async function readForecastWorkbook(
  buffer: Buffer | Uint8Array,
): Promise<RawForecastRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

  const sheet = workbook.getWorksheet(FORECAST_SHEET);
  if (!sheet) {
    throw new Error(`Không tìm thấy sheet bắt buộc "${FORECAST_SHEET}".`);
  }

  if (textFromCell(sheet.getCell("D5")).toLowerCase() !== "code") {
    throw new Error("Sheet Forecast 5M không đúng cấu trúc: thiếu cột Code tại D5.");
  }

  const salesDemand = readSalesDemand(workbook);
  const purchaseReceipts = readPurchaseReceipts(workbook);
  const rows: RawForecastRow[] = [];

  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rawSku = textFromCell(row.getCell(4)).toUpperCase();
    const productName = textFromCell(row.getCell(5));

    // The source workbook contains a second historical/alternative PO table
    // below the first Forecast 5M table. Its repeated header marks the end of
    // the canonical import area; importing it would create duplicate SKUs.
    if (rows.length > 0 && rawSku === "CODE") break;

    if (!rawSku && !productName) {
      continue;
    }

    rows.push({
      rowNumber,
      rawSku,
      productName,
      exPrice: decimalFromCell(row.getCell(6)),
      annualPlannedQty: numberFromCell(row.getCell(7)) ?? 0,
      annualImportedAmount: decimalFromCell(row.getCell(8)),
      currentStock: numberFromCell(row.getCell(19)),
      purchaseWaves: readPurchaseWaves(row),
      monthlyDemand: salesDemand.get(rawSku) ?? [],
      purchaseReceipts: purchaseReceipts.get(rawSku) ?? [],
    });
  }

  if (rows.length === 0) {
    throw new Error("Sheet Forecast 5M không có dòng sản phẩm hợp lệ.");
  }

  return rows;
}
