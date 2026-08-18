import type {
  DashboardInsightView,
  DashboardKpiView,
} from "@/features/reports/report-types";

interface DashboardHealthCardsProps {
  currencyCode: string;
  kpis: DashboardKpiView;
  insights: DashboardInsightView;
}

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
}

export function DashboardHealthCards({
  currencyCode,
  kpis,
  insights,
}: DashboardHealthCardsProps) {
  const money = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  });
  const percent = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
  }).format(insights.budgetUtilization);
  const activeBatchCount = Object.values(insights.batchStatusCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const nextEta = formatDate(insights.nextEtaDate);
  const remainingBudget = kpis.targetAmount <= 0
    ? "Chưa thiết lập"
    : kpis.gapAmount < 0
      ? `Vượt ${money.format(Math.abs(kpis.gapAmount))}`
      : money.format(kpis.gapAmount);

  return (
    <section className="dashboard-health" aria-label="Sức khỏe kế hoạch">
      <article className="dashboard-health-card" data-testid="dashboard-health-card" data-tone={kpis.actionableSkuCount > 0 ? "attention" : "positive"}>
        <p className="section-index">Hàng hóa</p>
        <strong className="dashboard-health-card__value">
          {kpis.actionableSkuCount.toLocaleString("vi-VN")} SKU cần xử lý
        </strong>
        <p>
          {kpis.criticalCount.toLocaleString("vi-VN")} SKU khẩn cấp · {insights.totalRecommendedQty.toLocaleString("vi-VN")} sản phẩm cần bổ sung
        </p>
        <small>
          {insights.topPriorityRows[0]
            ? `Ưu tiên: ${insights.topPriorityRows[0].sku}`
            : "Không còn sản phẩm cần bổ sung"}
        </small>
      </article>

      <article className="dashboard-health-card" data-testid="dashboard-health-card" data-tone={kpis.gapAmount < 0 ? "critical" : "neutral"}>
        <p className="section-index">Ngân sách</p>
        <strong className="dashboard-health-card__value">{remainingBudget}</strong>
        <p>{money.format(kpis.committedAmount)} đã lên đợt mua trên {money.format(kpis.targetAmount)}</p>
        <label>
          <span>{percent}% ngân sách đã sử dụng</span>
          <progress
            aria-label="Mức sử dụng ngân sách"
            max={100}
            value={Math.min(100, Math.max(0, insights.budgetUtilization))}
          />
        </label>
      </article>

      <article className="dashboard-health-card" data-testid="dashboard-health-card" data-tone={activeBatchCount > 0 ? "positive" : "attention"}>
        <p className="section-index">Cung ứng</p>
        <strong className="dashboard-health-card__value">
          {activeBatchCount.toLocaleString("vi-VN")} đợt mua đang hoạt động
        </strong>
        <p className="dashboard-health-card__statuses">
          Dự kiến {insights.batchStatusCounts.planned} · Đã gửi {insights.batchStatusCounts.submitted} · Đã xác nhận {insights.batchStatusCounts.confirmed} · Đã nhận {insights.batchStatusCounts.received}
        </p>
        <small>{nextEta ? `Ngày hàng về gần nhất ${nextEta}` : "Chưa có ngày hàng về"}</small>
      </article>
    </section>
  );
}
