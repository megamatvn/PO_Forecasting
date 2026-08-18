import Decimal from "decimal.js";
import { MAX_ANNUAL_PLAN_YEAR, monthSchema } from "@/features/annual-plans/contracts";
import type { AllocationInput } from "./calculations";

export interface AnnualLineInput { productId: string; exPrice: string; paidQty: number; expectedFoc: number; openingStock: number }
export interface PurchaseWaveInput { waveId: string; waveNumber: number; orderMonth: string; arrivalMonth: string; allocations: AllocationInput[] }
export interface StepValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
  summary: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  /** @deprecated Prefer fieldErrors/summary in new consumers. Kept as a small compatibility view. */
  errors: string[];
}
export type ValidationResult = StepValidationResult;

type ValidationIssue = { field: string; code: string; message: string; severity?: "error" | "warning" };

function result(issues: readonly ValidationIssue[] = []): ValidationResult {
  const fieldErrors: Record<string, string[]> = {};
  const summary: StepValidationResult["summary"] = [];
  for (const issue of issues) {
    if (issue.severity !== "warning") {
      (fieldErrors[issue.field] ??= []).push(issue.message);
    }
    summary.push({ code: issue.code, message: issue.message, severity: issue.severity ?? "error" });
  }
  return {
    valid: issues.every((issue) => issue.severity === "warning"),
    fieldErrors,
    summary,
    errors: issues.filter((issue) => issue.severity !== "warning").map((issue) => issue.message),
  };
}

function issue(field: string, code: string, message: string, severity?: ValidationIssue["severity"]): ValidationIssue {
  return { field, code, message, severity };
}

function isValidMoney(value: string): boolean {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return false;
  try { return new Decimal(value).isFinite() && !new Decimal(value).isNegative(); } catch { return false; }
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateScopeStep(input: { brandId?: string | null; planningYear: number; currentYear?: number }): ValidationResult {
  const issues: ValidationIssue[] = []; const currentYear = input.currentYear ?? new Date().getFullYear();
  if (!input.brandId?.trim()) issues.push(issue("brandId", "brand_required", "Cần chọn nhãn hàng."));
  if (!Number.isInteger(input.planningYear) || input.planningYear < currentYear) {
    issues.push(issue("planningYear", "past_planning_year", "Năm kế hoạch không được ở trong quá khứ."));
  } else if (input.planningYear > MAX_ANNUAL_PLAN_YEAR) {
    issues.push(issue("planningYear", "planning_year_out_of_range", `Năm kế hoạch không được sau ${MAX_ANNUAL_PLAN_YEAR}.`));
  }
  return result(issues);
}

export function validateAnnualLinesStep(lines: readonly AnnualLineInput[]): ValidationResult {
  const issues: ValidationIssue[] = []; const seen = new Set<string>();
  if (lines.length === 0) issues.push(issue("lines", "line_required", "Cần thêm ít nhất một SKU vào kế hoạch."));
  lines.forEach((line, index) => {
    const field = `lines.${index}`;
    if (!line.productId?.trim()) issues.push(issue(`${field}.productId`, "product_required", "Cần chọn SKU."));
    if (seen.has(line.productId)) issues.push(issue(`${field}.productId`, "duplicate_product", "SKU bị lặp trong danh sách kế hoạch."));
    seen.add(line.productId);
    if (![line.paidQty, line.expectedFoc, line.openingStock].every(isNonNegativeInteger)) {
      issues.push(issue(field, "quantity_nonnegative_integer", "Số lượng và tồn đầu kỳ phải là số nguyên không âm."));
    }
    if (!isValidMoney(line.exPrice)) issues.push(issue(`${field}.exPrice`, "invalid_ex_price", "Ex Price phải là số thập phân không âm, tối đa 6 chữ số."));
  });
  return result(issues);
}

export function validatePurchaseWavesStep(lines: readonly AnnualLineInput[], waves: readonly PurchaseWaveInput[], planningYear: number): ValidationResult {
  const issues: ValidationIssue[] = [];
  const waveIds = new Set<string>();
  const waveNumbers = new Set<number>();
  const totals = new Map<string, { paidQty: number; focQty: number }>();
  const lineByProduct = new Map(lines.map((line) => [line.productId, line]));

  if (waves.length === 0) issues.push(issue("waves", "wave_required", "Cần thêm ít nhất một đợt mua."));
  const orderedWaves = [...waves].sort((a, b) => a.waveNumber - b.waveNumber);

  waves.forEach((wave, waveIndex) => {
    const waveField = `waves.${waveIndex}`;
    if (!wave.waveId || waveIds.has(wave.waveId)) issues.push(issue(`${waveField}.waveId`, "duplicate_wave_id", "Mỗi đợt mua phải có mã ổn định và không bị lặp."));
    waveIds.add(wave.waveId);
    if (!Number.isSafeInteger(wave.waveNumber) || wave.waveNumber < 1 || waveNumbers.has(wave.waveNumber)) {
      issues.push(issue(`${waveField}.waveNumber`, "duplicate_wave_number", "Số thứ tự đợt mua phải là số nguyên dương và không bị lặp."));
    }
    waveNumbers.add(wave.waveNumber);
    const orderMonthValid = monthSchema.safeParse(wave.orderMonth).success && Number(wave.orderMonth.slice(0, 4)) === planningYear;
    const arrivalMonthValid = monthSchema.safeParse(wave.arrivalMonth).success && Number(wave.arrivalMonth.slice(0, 4)) === planningYear;
    if (!orderMonthValid) issues.push(issue(`${waveField}.orderMonth`, "invalid_order_month", "Tháng đặt hàng phải có định dạng YYYY-MM trong năm kế hoạch."));
    if (!arrivalMonthValid) issues.push(issue(`${waveField}.arrivalMonth`, "invalid_arrival_month", "Tháng hàng về phải có định dạng YYYY-MM trong năm kế hoạch."));
    if (orderMonthValid && arrivalMonthValid && wave.arrivalMonth < wave.orderMonth) {
      issues.push(issue(`${waveField}.arrivalMonth`, "arrival_before_order", "Tháng hàng về không được trước tháng đặt hàng."));
    }

    const productsInWave = new Set<string>();
    wave.allocations.forEach((allocation, allocationIndex) => {
      const allocationField = `${waveField}.allocations.${allocationIndex}`;
      const line = lineByProduct.get(allocation.productId);
      if (!line) issues.push(issue(`${allocationField}.productId`, "unknown_product", "Đợt mua chứa SKU không có trong kế hoạch năm."));
      if (productsInWave.has(allocation.productId)) issues.push(issue(`${allocationField}.productId`, "duplicate_allocation", "Một SKU chỉ được xuất hiện một lần trong mỗi đợt mua."));
      productsInWave.add(allocation.productId);
      if (!isNonNegativeInteger(allocation.paidQty) || !isNonNegativeInteger(allocation.focQty)) {
        issues.push(issue(allocationField, "quantity_nonnegative_integer", "Số lượng Qty và FOC phải là số nguyên không âm."));
      }
      if (!isValidMoney(allocation.exPrice)) {
        issues.push(issue(`${allocationField}.exPrice`, "invalid_ex_price", "Ex Price phải là số thập phân không âm, tối đa 6 chữ số."));
      } else if (line && new Decimal(allocation.exPrice).cmp(new Decimal(line.exPrice)) !== 0) {
        issues.push(issue(`${allocationField}.exPrice`, "ex_price_mismatch", "Ex Price của đợt mua phải khớp với kế hoạch năm."));
      }
      const current = totals.get(allocation.productId) ?? { paidQty: 0, focQty: 0 };
      current.paidQty += allocation.paidQty;
      current.focQty += allocation.focQty;
      totals.set(allocation.productId, current);
    });
  });

  // Compare after sorting so a wave-number/date mismatch is deterministic even if the UI sends rows out of order.
  let previousMonth: string | undefined;
  orderedWaves.forEach((wave, index) => {
    const monthValid = monthSchema.safeParse(wave.orderMonth).success && Number(wave.orderMonth.slice(0, 4)) === planningYear;
    if (monthValid && previousMonth && wave.orderMonth < previousMonth) {
      issues.push(issue(`waves.${index}.orderMonth`, "month_order", "Tháng đặt hàng phải theo thứ tự các đợt mua."));
    }
    if (monthValid) previousMonth = wave.orderMonth;
  });

  lines.forEach((line, index) => {
    const total = totals.get(line.productId) ?? { paidQty: 0, focQty: 0 };
    if (total.paidQty !== line.paidQty) issues.push(issue(`lines.${index}.paidQty`, "paid_qty_mismatch", "Tổng số lượng phân bổ phải bằng số lượng mua cả năm."));
    if (total.focQty !== line.expectedFoc) issues.push(issue(`lines.${index}.expectedFoc`, "foc_qty_mismatch", "Tổng FOC phân bổ phải bằng FOC dự kiến cả năm."));
  });
  return result(issues);
}
