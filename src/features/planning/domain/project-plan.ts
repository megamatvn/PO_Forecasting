import {
  calculateClosingStock,
  calculateShortage,
} from "@/lib/domain/stock";

export interface PlannedReceipt {
  monthIndex: number;
  qty: number;
  focQty: number;
  isCancelled: boolean;
}

export interface ProjectPlanInput {
  openingStock: number;
  targetStock: number;
  monthlyDemand: readonly number[];
  receipts: readonly PlannedReceipt[];
  monthLabels?: readonly string[];
}

export interface MonthlyProjection {
  monthIndex: number;
  month: string;
  openingStock: number;
  demand: number;
  receiptQty: number;
  closingStock: number;
  targetStock: number;
  shortage: number;
}

export function projectPlan({
  openingStock,
  targetStock,
  monthlyDemand,
  receipts,
  monthLabels = [],
}: ProjectPlanInput): MonthlyProjection[] {
  let rollingStock = openingStock;

  return monthlyDemand.map((demand, monthIndex) => {
    const monthReceipts = receipts.filter(
      (receipt) => receipt.monthIndex === monthIndex,
    );
    const receiptQty = monthReceipts.reduce(
      (total, receipt) =>
        total + (receipt.isCancelled ? 0 : receipt.qty + receipt.focQty),
      0,
    );
    const monthOpeningStock = rollingStock;
    const closingStock = calculateClosingStock({
      openingStock: monthOpeningStock,
      demand,
      qty: receiptQty,
      focQty: 0,
      isCancelled: false,
    });

    rollingStock = closingStock;

    return {
      monthIndex,
      month: monthLabels[monthIndex] ?? `M${monthIndex + 1}`,
      openingStock: monthOpeningStock,
      demand,
      receiptQty,
      closingStock,
      targetStock,
      shortage: calculateShortage(closingStock, targetStock),
    };
  });
}
