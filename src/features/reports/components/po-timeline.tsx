import type { PoTimelineItem } from "@/features/reports/report-types";

interface PoTimelineProps {
  currencyCode: string;
  batches: PoTimelineItem[];
}

const statusLabels = {
  planned: "Dự kiến",
  submitted: "Đã gửi",
  confirmed: "Đã xác nhận",
  received: "Đã nhận",
  cancelled: "Đã hủy",
} as const;

export function getPurchaseBatchStatusLabel(status: PoTimelineItem["status"]) {
  return statusLabels[status];
}

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function PoTimeline({ currencyCode, batches }: PoTimelineProps) {
  const money = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  });

  return (
    <section id="po-timeline" className="po-timeline" aria-labelledby="po-timeline-title">
      <header>
        <div>
          <p className="section-index">Đợt mua & ngày hàng về</p>
          <h2 id="po-timeline-title">Lịch cung ứng</h2>
        </div>
        <div className="po-timeline__legend" aria-label="Chú giải trạng thái">
          {Object.entries(statusLabels).slice(0, 4).map(([status, label]) => (
            <span key={status} className={`po-status po-status--${status}`}>{label}</span>
          ))}
        </div>
      </header>
      {batches.length === 0 ? (
        <div className="version-diff__empty">Chưa có đợt PO phù hợp bộ lọc.</div>
      ) : (
        <ol className="po-timeline__list">
          {batches.map((batch) => (
            <li key={batch.id}>
              <div className="po-timeline__marker" aria-hidden="true" />
              <article aria-label={`PO #${batch.batchNumber} · ${batch.name}`}>
                <header>
                  <div>
                    <small>PO #{batch.batchNumber}</small>
                    <h3>{batch.name}</h3>
                  </div>
                  <span className={`po-status po-status--${batch.status}`}>
                    {getPurchaseBatchStatusLabel(batch.status)}
                  </span>
                </header>
                <dl>
                  <div><dt>Ngày đặt</dt><dd>{dateFormatter.format(new Date(batch.orderDate))}</dd></div>
                  <div><dt>Ngày hàng về</dt><dd>{dateFormatter.format(new Date(batch.etaDate))}</dd></div>
                  <div><dt>Giá trị</dt><dd>{money.format(batch.amount)}</dd></div>
                  <div><dt>Dòng hàng</dt><dd>{batch.lineCount.toLocaleString("vi-VN")}</dd></div>
                </dl>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
