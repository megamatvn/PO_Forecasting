import type { PlanningWorkspaceView } from "@/features/planning/planning-types";

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}
interface KpiStripProps {
  plan: PlanningWorkspaceView;
}

export function KpiStrip({ plan }: KpiStripProps) {
  const target = Number(plan.cycle.targetPurchaseAmount);
  const committed = plan.rows.reduce(
    (total, row) => total + Number(row.amount),
    0,
  );
  const criticalCount = plan.rows.filter(
    (row) => row.severity === "critical",
  ).length;
  const poCount = plan.rows.filter((row) => row.qty > 0).length;
  const metrics = [
    { label: "Ngân sách mục tiêu", value: money(target, plan.cycle.currencyCode) },
    { label: "Đã lên PO", value: money(committed, plan.cycle.currencyCode) },
    { label: "Ngân sách còn lại", value: money(target - committed, plan.cycle.currencyCode) },
    { label: "Cần xử lý khẩn cấp", value: criticalCount.toLocaleString("vi-VN") },
    { label: "SKU có PO", value: poCount.toLocaleString("vi-VN") },
  ];

  return (
    <section className="planning-kpis" aria-label="Chỉ số kế hoạch">
      {metrics.map((metric) => (
        <article key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}
