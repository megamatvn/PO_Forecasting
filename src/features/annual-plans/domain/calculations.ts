import Decimal from "decimal.js";

export interface AnnualLineCalculationInput { exPrice: string; paidQty: number; expectedFoc: number; openingStock: number }
export interface AnnualLineCalculation { totalReceipts: number; plannedAmount: string }
export interface AllocationInput { productId: string; paidQty: number; focQty: number; exPrice: string }
export interface AllocationSummary { paidQty: number; focQty: number; amount: string }

export function calculateAnnualLine(input: AnnualLineCalculationInput): AnnualLineCalculation {
  const exPrice = input.exPrice.trim() === "" ? "0" : input.exPrice;
  return { totalReceipts: input.paidQty + input.expectedFoc, plannedAmount: new Decimal(input.paidQty).mul(exPrice).toFixed(2) };
}

export function summarizeAllocations(allocations: readonly AllocationInput[]): Record<string, AllocationSummary> {
  const result: Record<string, AllocationSummary> = {};
  for (const allocation of allocations) {
    const current = result[allocation.productId] ?? { paidQty: 0, focQty: 0, amount: "0.00" };
    current.paidQty += allocation.paidQty;
    current.focQty += allocation.focQty;
    current.amount = new Decimal(current.amount).plus(new Decimal(allocation.paidQty).mul(allocation.exPrice)).toFixed(2);
    result[allocation.productId] = current;
  }
  return result;
}
