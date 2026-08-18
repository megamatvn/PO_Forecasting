import type { DashboardKpiView } from "@/features/reports/report-types";
import { MetricStrip } from "@/components/ui/metric-strip";

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
  const utilization = kpis.targetAmount > 0
    ? Math.round(Math.min(100, (kpis.committedAmount / kpis.targetAmount) * 100) * 10) / 10
    : 0;
  const utilizationLabel = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
  }).format(utilization);
  return (
    <div id="cash-summary">
      <MetricStrip
        ariaLabel="Chỉ số vận hành kế hoạch"
        items={[
          {
            label: "Ngân sách mục tiêu",
            value: money.format(kpis.targetAmount),
            supportingText: (
              <>
                <span>Đã sử dụng {utilizationLabel}% ngân sách</span>
                <progress
                  aria-label="Mức sử dụng ngân sách"
                  max={100}
                  value={utilization}
                />
              </>
            ),
          },
          {
            label: "Đã lên PO",
            value: money.format(kpis.committedAmount),
            tone: "positive",
          },
          {
            label: "Ngân sách còn lại",
            value: money.format(kpis.gapAmount),
            tone: "warning",
          },
          {
            label: "SKU cần xử lý",
            value: `${kpis.actionableSkuCount.toLocaleString("vi-VN")} SKU`,
            tone: "critical",
          },
        ]}
      />
    </div>
  );
}
