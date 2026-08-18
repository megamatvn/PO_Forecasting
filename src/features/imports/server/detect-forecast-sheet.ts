import ExcelJS from "exceljs";
import type { ForecastSheetCandidate } from "@/features/imports/domain/import-types";

const SCAN_ROW_LIMIT = 20;
const REQUIRED_SIGNAL_COUNT = 7;

function normalizeHeader(value: ExcelJS.CellValue): string {
  const scalar = typeof value === "object" && value !== null && "result" in value
    ? value.result
    : value;

  return String(scalar ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function isPopulated(sheet: ExcelJS.Worksheet): boolean {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, SCAN_ROW_LIMIT); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= row.cellCount; column += 1) {
      if (normalizeHeader(row.getCell(column).value) !== "") return true;
    }
  }
  return false;
}

function signalLabels(sheet: ExcelJS.Worksheet, headerRow: number): string[] {
  const header = sheet.getRow(headerRow);
  const subHeader = sheet.getRow(headerRow + 1);
  const lastColumn = Math.max(header.cellCount, subHeader.cellCount);

  return Array.from({ length: lastColumn }, (_, index) => {
    const column = index + 1;
    return `${normalizeHeader(header.getCell(column).value)} ${normalizeHeader(subHeader.getCell(column).value)}`.trim();
  });
}

function describeSheet(sheet: ExcelJS.Worksheet): ForecastSheetCandidate {
  let best: ForecastSheetCandidate = {
    sheetName: sheet.name,
    headerRow: 1,
    score: 0,
    missingHeaders: [
      "Code/SKU",
      "Product Name",
      "Ex Price",
      "Current Stock",
      "PO Qty",
      "PO FOC",
      "PO Amount",
    ],
  };

  if (!isPopulated(sheet)) return best;

  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, SCAN_ROW_LIMIT); rowNumber += 1) {
    const labels = signalLabels(sheet, rowNumber);
    const code = labels.some((label) => containsAny(label, ["code", "sku", "ma hang"]));
    const product = labels.some((label) => containsAny(label, ["product name", "ten san pham"]));
    const exPrice = labels.some((label) => containsAny(label, ["ex price", "gia ex"]));
    const currentStock = labels.some((label) => containsAny(label, ["current stock", "ton kho", "soh"]));
    // Merged Excel headers retain the PO label only in their first cell; the
    // adjacent Qty/FOC/Amount cells still prove the repeating PO structure.
    const poQty = labels.some((label) => label.includes("po") && label.includes("qty")) ||
      labels.some((label) => label === "qty");
    const poFoc = labels.some((label) => label.includes("foc"));
    const poAmount = labels.some((label) => label.includes("po") && label.includes("amount")) ||
      labels.some((label) => label === "amount");
    const signals = [
      ["Code/SKU", code],
      ["Product Name", product],
      ["Ex Price", exPrice],
      ["Current Stock", currentStock],
      ["PO Qty", poQty],
      ["PO FOC", poFoc],
      ["PO Amount", poAmount],
    ] as const;
    const score = signals.filter(([, matched]) => matched).length;
    const candidate = {
      sheetName: sheet.name,
      headerRow: rowNumber,
      score,
      missingHeaders: signals.filter(([, matched]) => !matched).map(([name]) => name),
    };

    if (candidate.score > best.score) best = candidate;
  }

  return best;
}

/** A sheet is selectable only when all seven planning signals are present. */
export function isForecastSheetCandidate(candidate: ForecastSheetCandidate): boolean {
  return candidate.score >= REQUIRED_SIGNAL_COUNT;
}

export function detectForecastSheets(workbook: ExcelJS.Workbook): ForecastSheetCandidate[] {
  return workbook.worksheets.map(describeSheet);
}

export class ForecastSheetSelectionRequiredError extends Error {
  constructor(readonly candidates: ForecastSheetCandidate[]) {
    super("Có nhiều sheet kế hoạch phù hợp.");
    this.name = "ForecastSheetSelectionRequiredError";
  }
}

export class ForecastSheetNotFoundError extends Error {
  constructor(readonly diagnostics: ForecastSheetCandidate[]) {
    super("Không nhận diện được sheet kế hoạch phù hợp.");
    this.name = "ForecastSheetNotFoundError";
  }
}
