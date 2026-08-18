import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { ANNUAL_PLAN_SCHEMA_ID, ANNUAL_PLAN_TEMPLATE_VERSION, annualPlanBusinessSheets, type ExcelTemplateLine, type ExcelTemplateWave } from "./template";
import { validateAnnualPlanExcel, type ExcelDiagnostic } from "./validation";

export interface ExcelPreviewDTO { importSessionId: string; checksum: string; templateVersion: typeof ANNUAL_PLAN_TEMPLATE_VERSION; brand: { id: string; code: string; name: string }; planningYear: number; lines: Array<ExcelTemplateLine & { isNew: boolean }>; waves: ExcelTemplateWave[]; diagnostics: ExcelDiagnostic[]; canApply: boolean; lockVersion: number; revisionId: string }
export interface ExcelParserOptions {
  expectedBrandId?: string;
  expectedPlanningYear?: number;
  knownSkus?: Set<string>;
  skuAliases?: Map<string, string>;
  skuProductIds?: Map<string, string>;
}

function isFormula(cell: ExcelJS.Cell): boolean {
  const raw = cell.value;
  return Boolean(raw && typeof raw === "object" && ("formula" in raw || "sharedFormula" in raw));
}
function value(cell: ExcelJS.Cell): unknown { return isFormula(cell) ? undefined : cell.value; }
function text(cell: ExcelJS.Cell): string { const raw = value(cell); return raw == null ? "" : String(raw).trim(); }
function integer(cell: ExcelJS.Cell): number { const raw = value(cell); return raw == null || raw === "" ? 0 : Number(raw); }

export async function parseAnnualPlanWorkbook(buffer: Buffer | Uint8Array | ArrayBuffer, options: ExcelParserOptions = {}): Promise<ExcelPreviewDTO> {
  const bytes = Buffer.from(buffer as ArrayBufferLike);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const diagnostics: ExcelDiagnostic[] = [];
  if ((workbook as unknown as { vbaProject?: unknown }).vbaProject) diagnostics.push({ sheet: "Workbook", row: 1, column: "", code: "MACRO_NOT_ALLOWED", severity: "error", message: "File có macro, vui lòng tải đúng mẫu Excel không macro." });
  const externalLinks = (workbook as unknown as { _externalLinks?: unknown[] })._externalLinks;
  if (Array.isArray(externalLinks) && externalLinks.length > 0) diagnostics.push({ sheet: "Workbook", row: 1, column: "", code: "EXTERNAL_LINK_NOT_ALLOWED", severity: "error", message: "File có liên kết ngoài, vui lòng tải đúng mẫu Excel không liên kết ngoài." });
  const visible = workbook.worksheets.filter((sheet) => sheet.state === "visible").map((sheet) => sheet.name);
  if (visible.length !== 2 || annualPlanBusinessSheets.some((sheet) => !visible.includes(sheet))) diagnostics.push({ sheet: "Workbook", row: 1, column: "", code: "TEMPLATE_SHEETS_INVALID", severity: "error", message: "File phải có đúng hai trang Kế hoạch SKU và Phân bổ PO." });
  const metadataSheet = workbook.getWorksheet("__SAGEN_META");
  const metadata = new Map<string, string>();
  if (!metadataSheet) diagnostics.push({ sheet: "Workbook", row: 1, column: "", code: "METADATA_MISSING", severity: "error", message: "Không tìm thấy thông tin phiên bản mẫu." });
  else metadataSheet.eachRow((row, rowNumber) => { if (rowNumber > 1) metadata.set(text(row.getCell(1)), text(row.getCell(2))); });
  if (metadata.get("templateVersion") !== ANNUAL_PLAN_TEMPLATE_VERSION || metadata.get("schemaId") !== ANNUAL_PLAN_SCHEMA_ID) diagnostics.push({ sheet: "Workbook", row: 1, column: "", code: "TEMPLATE_VERSION_INVALID", severity: "error", message: "File không đúng phiên bản mẫu Sagen." });
  const planningYear = Number(metadata.get("planningYear") ?? 0); const brandId = metadata.get("brandId") ?? "";
  if (options.expectedBrandId && brandId !== options.expectedBrandId) diagnostics.push({ sheet: "Workbook", row: 1, column: "", code: "BRAND_MISMATCH", severity: "error", message: "File không thuộc nhãn hàng đang chọn." });
  if (options.expectedPlanningYear && planningYear !== options.expectedPlanningYear) diagnostics.push({ sheet: "Workbook", row: 1, column: "", code: "YEAR_MISMATCH", severity: "error", message: "File không thuộc năm kế hoạch đang chọn." });
  const skuSheet = workbook.getWorksheet("Kế hoạch SKU"); const waveSheet = workbook.getWorksheet("Phân bổ PO");
  const lines: Array<ExcelTemplateLine & { isNew: boolean }> = [];
  const canonicalSku = (rawSku: string) => options.skuAliases?.get(rawSku.trim().toUpperCase()) ?? rawSku.trim().toUpperCase();
  const productIdForSku = (sku: string) => options.skuProductIds?.get(sku) ?? null;
  if (skuSheet) for (let rowNumber = 2; rowNumber <= skuSheet.rowCount; rowNumber += 1) {
    const row = skuSheet.getRow(rowNumber);
    const sku = text(row.getCell(1));
    if (!sku && !text(row.getCell(2))) continue;
    [1, 2, 3, 4, 5, 6].forEach((column) => {
      if (isFormula(row.getCell(column))) diagnostics.push({ sheet: "Kế hoạch SKU", row: rowNumber, column: String.fromCharCode(64 + column), code: "FORMULA_NOT_ALLOWED", severity: "error", message: "Không dùng công thức trong dữ liệu nhập." });
    });
    const normalizedSku = canonicalSku(sku);
    lines.push({ productId: productIdForSku(normalizedSku), sku: normalizedSku, name: text(row.getCell(2)), exPrice: text(row.getCell(3)), paidQty: integer(row.getCell(4)), expectedFoc: integer(row.getCell(5)), openingStock: integer(row.getCell(6)), isNew: !(options.knownSkus?.has(normalizedSku) ?? false) });
  }
  const waveInput: Array<{ orderMonth: string; arrivalMonth: string; sku: string; paidQty: number; focQty: number }> = [];
  const wavesByKey = new Map<string, ExcelTemplateWave>();
  if (waveSheet) for (let rowNumber = 2; rowNumber <= waveSheet.rowCount; rowNumber += 1) {
    const row = waveSheet.getRow(rowNumber);
    const sku = text(row.getCell(4));
    if (!sku) continue;
    [1, 2, 3, 4, 5, 6].forEach((column) => {
      if (isFormula(row.getCell(column))) diagnostics.push({ sheet: "Phân bổ PO", row: rowNumber, column: String.fromCharCode(64 + column), code: "FORMULA_NOT_ALLOWED", severity: "error", message: "Không dùng công thức trong dữ liệu nhập." });
    });
    const po = text(row.getCell(1)); const sequence = Number(po.replace(/\D/g, "")) || 1;
    const parsed = { orderMonth: text(row.getCell(2)), arrivalMonth: text(row.getCell(3)), sku: canonicalSku(sku), paidQty: integer(row.getCell(5)), focQty: integer(row.getCell(6)) };
    waveInput.push(parsed);
    const existing = wavesByKey.get(String(sequence)) ?? { id: `client-wave-${sequence}`, sequence, orderMonth: parsed.orderMonth, arrivalMonth: parsed.arrivalMonth, allocations: [] };
    existing.allocations.push({ productId: productIdForSku(parsed.sku), sku: parsed.sku, paidQty: parsed.paidQty, focQty: parsed.focQty, exPrice: lines.find((line) => line.sku === parsed.sku)?.exPrice ?? "0" });
    wavesByKey.set(String(sequence), existing);
  }
  diagnostics.push(...validateAnnualPlanExcel({ planningYear, lines, waves: waveInput, knownSkus: options.knownSkus }));
  const brand = { id: brandId, code: metadata.get("brandCode") ?? "", name: metadata.get("brandName") ?? "" };
  return { importSessionId: randomUUID(), checksum, templateVersion: ANNUAL_PLAN_TEMPLATE_VERSION, brand, planningYear, lines, waves: [...wavesByKey.values()].sort((a, b) => a.sequence - b.sequence), diagnostics, canApply: diagnostics.every((diagnostic) => diagnostic.severity !== "error"), lockVersion: Number(metadata.get("lockVersion") ?? 0), revisionId: metadata.get("revisionId") ?? "" };
}

export const parsePurchasePlanWorkbook = parseAnnualPlanWorkbook;
