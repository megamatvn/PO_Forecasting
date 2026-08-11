import type { DashboardKpiView } from "@/features/reports/report-types";

interface DashboardKpisProps {
  currencyCode: string;
  kpis: DashboardKpiView;
}

export function DashboardKpis({ currencyCode, kpis }: DashboardKpisProps) {
  const money = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  });
  const items = [
    { label: "Ngân sách mục tiêu", value: money.format(kpis.targetAmount), tone: "neutral" },
    { label: "Đã cam kết", value: money.format(kpis.committedAmount), tone: "positive" },
    { label: "Khoảng trống", value: money.format(kpis.gapAmount), tone: "attention" },
    { label: "Thiếu hàng Critical", value: `${kpis.criticalCount.toLocaleString("vi-VN")} SKU`, tone: "critical" },
    { label: "Lịch mua", value: `${kpis.poCount.toLocaleString("vi-VN")} đợt PO`, tone: "neutral" },
  ];

  return (
    <section id="cash-summary" className="dashboard-kpis" aria-label="Chỉ số điều hành và Cash Summary">
      {items.map((item) => (
        <article key={item.label} className={`dashboard-kpi dashboard-kpi--${item.tone}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </section>
  );
}
