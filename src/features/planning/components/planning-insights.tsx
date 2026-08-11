import type { PlanningRowView } from "@/features/planning/planning-types";

interface PlanningInsightsProps {
  rows: PlanningRowView[];
}
export function PlanningInsights({ rows }: PlanningInsightsProps) {
  const shortage = rows
    .filter((row) => row.recommendedQty > 0)
    .sort((left, right) => right.recommendedQty - left.recommendedQty);

  return (
    <aside className="planning-insights" aria-label="Phân tích nhanh">
      <p className="section-index">Phân tích nhanh</p>
      <h2>Ưu tiên theo mức thiếu</h2>
      {shortage.length === 0 ? (
        <p className="muted-copy">Không có SKU cần bổ sung.</p>
      ) : (
        <ol>
          {shortage.slice(0, 5).map((row) => (
            <li key={row.planLineId}>
              <span>{row.sku}</span>
              <strong>{row.recommendedQty.toLocaleString("vi-VN")}</strong>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
