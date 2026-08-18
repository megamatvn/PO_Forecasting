import Link from "next/link";
import type { DashboardActionDTO } from "../contracts";

const kindLabels = {
  approval: "Cần xử lý",
  over_plan: "Vượt kế hoạch",
  late_wave: "Theo dõi",
  private_draft: "Bản nháp riêng",
} as const;

export function ActionSummary({ actions }: { actions: DashboardActionDTO[] }) {
  return (
    <section className="v2-dashboard-panel v2-dashboard-actions" aria-labelledby="dashboard-actions-title" aria-label="Việc cần xử lý">
      <div className="v2-dashboard-panel__header">
        <div>
          <p className="section-index">Ưu tiên hôm nay</p>
          <h2 id="dashboard-actions-title">Việc cần xử lý</h2>
        </div>
        <span>{actions.length ? `${actions.length} việc` : "Không có việc gấp"}</span>
      </div>
      {actions.length ? (
        <ul className="v2-dashboard-action-list">
          {actions.map((action) => (
            <li key={action.id} data-kind={action.kind}>
              <div className="v2-dashboard-action-list__copy">
                <span className="v2-dashboard-action-list__kind">{kindLabels[action.kind]}</span>
                <Link href={action.href}>{action.title}</Link>
                <p>{action.detail}</p>
              </div>
              <div className="v2-dashboard-action-list__meta">
                {action.dueLabel ? <span>{action.dueLabel}</span> : null}
                <Link className="button button--small" href={action.href}>Mở</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="v2-dashboard-empty"><strong>Mọi việc đang trong tầm kiểm soát.</strong><p>Hệ thống sẽ đưa các đề xuất, PO có rủi ro và ngoại lệ lên đây.</p></div>
      )}
    </section>
  );
}
