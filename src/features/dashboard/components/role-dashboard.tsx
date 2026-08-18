import Link from "next/link";
import type { RoleDashboardDTO } from "../contracts";
import { ActionSummary } from "./action-summary";
import { ExceptionList } from "./exception-list";
import { PlanHealthMetrics } from "./plan-health-metrics";
import { PurchaseWaveProgress } from "./purchase-wave-progress";

const tierLabels = { employee_viewer: "Người xem", leader: "Leader", manager: "Manager", executive: "CEO / BOD" } as const;

export function RoleDashboard({ data }: { data: RoleDashboardDTO }) {
  const scopeLabel = [data.context.brandCode, data.context.planningYear].filter(Boolean).join(" · ") || "Toàn bộ phạm vi được cấp quyền";
  return (
    <section className="v2-role-dashboard" aria-labelledby="role-dashboard-title">
      <header className="v2-role-dashboard__header">
        <div>
          <p className="section-index">Trung tâm công việc</p>
          <h2 id="role-dashboard-title">Xin chào, {data.displayName}</h2>
          <p>{tierLabels[data.context.tier]} · phạm vi {scopeLabel}.</p>
        </div>
        <div className="v2-role-dashboard__header-actions">
          {data.context.brandId && data.context.planningYear && data.canViewBaseline ? <Link className="button" href={`/api/v2/reports/approved-plan?brandId=${encodeURIComponent(data.context.brandId)}&planningYear=${data.context.planningYear}`}>Xuất kế hoạch đã duyệt</Link> : null}
          {data.context.tier === "leader" || data.context.tier === "manager" ? <Link className="button button--primary" href="/proposals/new">Tạo đề xuất mua hàng</Link> : null}
          {data.context.tier === "manager" || data.context.tier === "executive" ? <Link className="button" href="/approvals">Mở hộp việc duyệt</Link> : null}
        </div>
      </header>
      <div className="v2-role-dashboard__grid">
        <ActionSummary actions={data.actions} />
        <PlanHealthMetrics metrics={data.metrics} canViewBaseline={data.canViewBaseline} />
        <PurchaseWaveProgress waves={data.waves} />
        <ExceptionList exceptions={data.exceptions} />
      </div>
    </section>
  );
}
