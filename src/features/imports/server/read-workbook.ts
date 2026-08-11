import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import type {
  RawForecastRow,
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

function decimalFromCell(cell: ExcelJS.Cell): string | null {
  const value = numberFromCell(cell);
  return value === null ? null : new Decimal(value).toFixed(2);
}

function readPurchaseWaves(row: ExcelJS.Row): RawPurchaseWave[] {
  return purchaseWaveColumns.map(({ waveNumber, qty, focQty, amount }) => ({
    waveNumber,
    qty: numberFromCell(row.getCell(qty)) ?? 0,
    focQty: numberFromCell(row.getCell(focQty)) ?? 0,
    importedAmount: decimalFromCell(row.getCell(amount)),
  }));
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

  const rows: RawForecastRow[] = [];

  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rawSku = textFromCell(row.getCell(4)).toUpperCase();
    const productName = textFromCell(row.getCell(5));

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
    });
  }

  if (rows.length === 0) {
    throw new Error("Sheet Forecast 5M không có dòng sản phẩm hợp lệ.");
  }

  return rows;
}
