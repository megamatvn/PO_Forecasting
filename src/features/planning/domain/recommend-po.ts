import { calculateShortage } from "@/lib/domain/stock";
import type { MonthlyProjection } from "@/features/planning/domain/project-plan";

export type StockSeverity = "healthy" | "warning" | "critical";

export interface PurchaseRecommendation {
  minimumQty: number;
  recommendedQty: number;
  firstShortageMonth: string | null;
  severity: StockSeverity;
}

export interface StockAlert {
  month: string;
  shortage: number;
  severity: Exclude<StockSeverity, "healthy">;
  label: "Warning" | "Critical";
  message: string;
}

function severityForProjection(
  projection: MonthlyProjection,
  targetStock: number,
): StockSeverity {
  if (projection.closingStock < 0) {
    return "critical";
  }

  if (projection.closingStock < targetStock) {
    return "warning";
  }

  return "healthy";
}

export function recommendPurchase(
  projections: readonly MonthlyProjection[],
  targetStock: number,
): PurchaseRecommendation {
  const shortageByMonth = projections.map((projection) =>
    calculateShortage(projection.closingStock, targetStock),
  );
  const minimumQty = Math.max(0, ...shortageByMonth);
  const firstShortageIndex = shortageByMonth.findIndex(
    (shortage) => shortage > 0,
  );
  const hasCriticalMonth = projections.some(
    (projection) => severityForProjection(projection, targetStock) === "critical",
  );

  return {
    minimumQty,
    recommendedQty: minimumQty,
    firstShortageMonth:
      firstShortageIndex === -1
        ? null
        : projections[firstShortageIndex]?.month ?? null,
    severity: hasCriticalMonth
      ? "critical"
      : minimumQty > 0
        ? "warning"
        : "healthy",
  };
}

export function buildStockAlerts(
  projections: readonly MonthlyProjection[],
  targetStock: number,
): StockAlert[] {
  return projections.flatMap((projection) => {
    const shortage = calculateShortage(projection.closingStock, targetStock);
    const severity = severityForProjection(projection, targetStock);

    if (shortage === 0 || severity === "healthy") {
      return [];
    }

    const label = severity === "critical" ? "Critical" : "Warning";

    return [
      {
        month: projection.month,
        shortage,
        severity,
        label,
        message: `Thiếu tối thiểu ${shortage.toLocaleString("vi-VN")} sản phẩm tại ${projection.month}.`,
      },
    ];
  });
}
