import type { DashboardMetricDTO } from "../contracts";

export function PlanHealthMetrics({ metrics, canViewBaseline }: { metrics: DashboardMetricDTO[]; canViewBaseline: boolean }) {
  return (
    <section className="v2-dashboard-panel v2-dashboard-health" aria-label="Sức khỏe kế hoạch">
      <div className="v2-dashboard-panel__header">
        <div>
          <p className="section-index">Tóm tắt theo quyền truy cập</p>
          <h2>Sức khỏe kế hoạch</h2>
        </div>
        <span>{canViewBaseline ? "Baseline đã duyệt" : "Chưa được cấp quyền xem baseline"}</span>
      </div>
      <div className="v2-dashboard-metric-grid">
        {metrics.map((item) => (
          <article className="v2-dashboard-metric" key={item.key} data-metric={item.key}>
            <p>{item.label}</p>
            <strong>{item.amount}</strong>
            <span>{item.context}</span>
            {item.progress !== null ? <progress max={100} value={item.progress} aria-label={`${item.label}: ${item.progress}%`} /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
