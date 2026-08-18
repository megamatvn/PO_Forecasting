import Link from "next/link";
import { getPurchaseBatchStatusLabel } from "@/features/reports/components/po-timeline";
import type { PoTimelineItem } from "@/features/reports/report-types";

interface DashboardSupplyPreviewProps {
  batches: PoTimelineItem[];
  currencyCode: string;
  supplyHref: string;
  planningHref: string;
}

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? "Chưa xác định" : dateFormatter.format(date);
}

export function DashboardSupplyPreview({
  batches,
  currencyCode,
  supplyHref,
  planningHref,
}: DashboardSupplyPreviewProps) {
  const money = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  });
  const visibleBatches = batches
    .filter((batch) => batch.status !== "cancelled")
    .toSorted((left, right) => left.etaDate.localeCompare(right.etaDate))
    .slice(0, 3);

  return (
    <section className="dashboard-panel dashboard-supply" aria-labelledby="dashboard-supply-title">
      <header className="dashboard-panel__header">
        <div>
          <p className="section-index">Cung ứng sắp tới</p>
          <h2 id="dashboard-supply-title">Mốc hàng về gần nhất</h2>
        </div>
      </header>
      {visibleBatches.length === 0 ? (
        <div className="dashboard-panel__empty">
          <strong>Chưa có đợt mua đang hoạt động.</strong>
          <p>Lập đợt mua để theo dõi ngày đặt hàng và ngày hàng về.</p>
          <Link className="button button--secondary" href={planningHref}>Lập đợt mua</Link>
        </div>
      ) : (
        <div className="dashboard-supply-list">
          {visibleBatches.map((batch) => (
            <article key={batch.id} aria-label={`Đợt mua ${batch.name}`}>
              <header>
                <div>
                  <small>Đợt #{batch.batchNumber}</small>
                  <h3>{batch.name}</h3>
                </div>
                <span className={`po-status po-status--${batch.status}`}>
                  {getPurchaseBatchStatusLabel(batch.status)}
                </span>
              </header>
              <dl>
                <div><dt>Ngày hàng về</dt><dd>{formatDate(batch.etaDate)}</dd></div>
                <div><dt>Giá trị</dt><dd>{money.format(batch.amount)}</dd></div>
                <div><dt>Dòng hàng</dt><dd>{batch.lineCount.toLocaleString("vi-VN")}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
      {visibleBatches.length > 0 ? (
        <Link className="dashboard-panel__link" href={supplyHref}>Xem toàn bộ lịch cung ứng</Link>
      ) : null}
    </section>
  );
}
