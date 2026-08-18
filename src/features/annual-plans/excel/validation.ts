import Decimal from "decimal.js";
import { monthSchema } from "@/features/annual-plans/contracts";

export type ExcelDiagnosticSeverity = "error" | "warning";
export interface ExcelDiagnostic { sheet: string; row: number; column: string; code: string; severity: ExcelDiagnosticSeverity; message: string }

function isValidDecimal(value: string): boolean {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return false;
  const [, fraction = ""] = normalized.split(".");
  return fraction.length <= 6;
}

export function validateAnnualPlanExcel(input: { planningYear: number; lines: Array<{ sku: string; name?: string; exPrice: string; paidQty: number; expectedFoc: number; openingStock: number }>; waves: Array<{ orderMonth: string; arrivalMonth: string; sku: string; paidQty: number; focQty: number }>; knownSkus?: Set<string> }): ExcelDiagnostic[] {
  const diagnostics: ExcelDiagnostic[] = [];
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    const row = index + 2;
    const sku = line.sku.trim().toUpperCase();
    if (!sku) diagnostics.push({ sheet: "Kế hoạch SKU", row, column: "A", code: "SKU_REQUIRED", severity: "error", message: "Mã SKU là bắt buộc." });
    if (seen.has(sku)) diagnostics.push({ sheet: "Kế hoạch SKU", row, column: "A", code: "DUPLICATE_SKU", severity: "error", message: "SKU bị lặp trong file." });
    seen.add(sku);
    try { const price = new Decimal(line.exPrice); if (price.isNegative() || !isValidDecimal(line.exPrice)) throw new Error(); } catch { diagnostics.push({ sheet: "Kế hoạch SKU", row, column: "C", code: "INVALID_EX_PRICE", severity: "error", message: "Ex Price phải là số không âm, tối đa 6 chữ số thập phân." }); }
    if (!Number.isSafeInteger(line.paidQty) || line.paidQty < 0) diagnostics.push({ sheet: "Kế hoạch SKU", row, column: "D", code: "INVALID_PAID_QTY", severity: "error", message: "Số lượng mua phải là số nguyên không âm." });
    if (!Number.isSafeInteger(line.expectedFoc) || line.expectedFoc < 0) diagnostics.push({ sheet: "Kế hoạch SKU", row, column: "E", code: "INVALID_FOC", severity: "error", message: "FOC phải là số nguyên không âm." });
    if (!Number.isSafeInteger(line.openingStock) || line.openingStock < 0) diagnostics.push({ sheet: "Kế hoạch SKU", row, column: "F", code: "INVALID_OPENING_STOCK", severity: "error", message: "Tồn đầu kỳ phải là số nguyên không âm." });
    if (input.knownSkus && !input.knownSkus.has(sku)) {
      if (!line.name?.trim()) diagnostics.push({ sheet: "Kế hoạch SKU", row, column: "B", code: "NEW_SKU_NAME_REQUIRED", severity: "error", message: "SKU mới phải có tên sản phẩm để tạo trong danh mục." });
      else diagnostics.push({ sheet: "Kế hoạch SKU", row, column: "A", code: "NEW_SKU", severity: "warning", message: "SKU mới sẽ được tạo trong danh mục của nhãn hàng khi áp dụng." });
    }
  });
  const annual = new Map(input.lines.map((line) => [line.sku.trim().toUpperCase(), { paid: line.paidQty, foc: line.expectedFoc }]));
  const allocated = new Map<string, { paid: number; foc: number }>();
  input.waves.forEach((wave, index) => {
    const row = index + 2;
    if (!monthSchema.safeParse(wave.orderMonth).success || !monthSchema.safeParse(wave.arrivalMonth).success || wave.arrivalMonth < wave.orderMonth || !wave.orderMonth.startsWith(String(input.planningYear)) || !wave.arrivalMonth.startsWith(String(input.planningYear))) diagnostics.push({ sheet: "Phân bổ PO", row, column: "B", code: "INVALID_MONTH", severity: "error", message: "Tháng đặt và tháng hàng về phải thuộc năm kế hoạch, định dạng YYYY-MM và đúng thứ tự." });
    const sku = wave.sku.trim().toUpperCase(); const current = allocated.get(sku) ?? { paid: 0, foc: 0 }; current.paid += wave.paidQty; current.foc += wave.focQty; allocated.set(sku, current);
    if (!annual.has(sku)) diagnostics.push({ sheet: "Phân bổ PO", row, column: "D", code: "UNKNOWN_SKU", severity: "error", message: "SKU trong phân bổ không có ở trang Kế hoạch SKU." });
    if (!Number.isSafeInteger(wave.paidQty) || wave.paidQty < 0) diagnostics.push({ sheet: "Phân bổ PO", row, column: "E", code: "INVALID_PAID_QTY", severity: "error", message: "Số lượng phải là số nguyên không âm." });
    if (!Number.isSafeInteger(wave.focQty) || wave.focQty < 0) diagnostics.push({ sheet: "Phân bổ PO", row, column: "F", code: "INVALID_FOC", severity: "error", message: "FOC phải là số nguyên không âm." });
  });
  annual.forEach((expected, sku) => { const actual = allocated.get(sku) ?? { paid: 0, foc: 0 }; if (actual.paid !== expected.paid || actual.foc !== expected.foc) diagnostics.push({ sheet: "Phân bổ PO", row: 1, column: "E/F", code: "ALLOCATION_MISMATCH", severity: "error", message: `${sku}: tổng Qty/FOC theo PO phải khớp kế hoạch năm.` }); });
  return diagnostics;
}
