import type { MonthlyStockInput } from "@/lib/domain/types";

export function calculateClosingStock(input: MonthlyStockInput): number {
  const receiptQty = input.isCancelled ? 0 : input.qty + input.focQty;

  return input.openingStock + receiptQty - input.demand;
}

export function calculateShortage(
  projectedStock: number,
  targetStock: number,
): number {
  return Math.max(0, targetStock - projectedStock);
}
