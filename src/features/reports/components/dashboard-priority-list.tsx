import Link from "next/link";
import { TruncatedText } from "@/components/ui/truncated-text";
import type { DashboardPriorityItem } from "@/features/reports/report-types";

interface DashboardPriorityListProps {
  rows: DashboardPriorityItem[];
  planningHref: string;
}

const severityLabels = {
  critical: "Khẩn cấp",
  warning: "Cần chú ý",
  healthy: "Ổn định",
} as const;

export function DashboardPriorityList({ rows, planningHref }: DashboardPriorityListProps) {
  const visibleRows = rows.slice(0, 5);

  return (
    <section className="dashboard-panel dashboard-priorities" aria-labelledby="dashboard-priorities-title">
      <header className="dashboard-panel__header">
        <div>
          <p className="section-index">Ưu tiên xử lý</p>
          <h2 id="dashboard-priorities-title">Việc cần làm trước</h2>
        </div>
        <span>{visibleRows.length.toLocaleString("vi-VN")} việc</span>
      </header>
      {visibleRows.length === 0 ? (
        <div className="dashboard-panel__empty">
          <strong>Không còn SKU cần bổ sung.</strong>
          <p>Kế hoạch hiện không có cảnh báo hàng hóa cần xử lý.</p>
        </div>
      ) : (
        <ol className="dashboard-priority-list">
          {visibleRows.map((row) => (
            <li key={row.planLineId}>
              <div className="dashboard-priority-list__identity">
                <strong>{row.sku}</strong>
                <TruncatedText>{row.productName}</TruncatedText>
              </div>
              <span className={`dashboard-status dashboard-status--${row.severity}`}>
                {severityLabels[row.severity]}
              </span>
              <div className="dashboard-priority-list__quantity">
                <small>Cần bổ sung</small>
                <strong>{row.recommendedQty.toLocaleString("vi-VN")}</strong>
              </div>
              <Link href={`${planningHref}&lineId=${encodeURIComponent(row.planLineId)}`}>
                Xử lý
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
