import type { PlanningVersionView } from "@/features/planning/planning-types";
import type { PlanStatus } from "@/lib/domain/types";

interface DashboardWorkflowStatusProps {
  version: PlanningVersionView;
}

const statusLabels: Record<PlanStatus, string> = {
  draft: "Bản nháp",
  submitted: "Đã gửi duyệt",
  review_l1: "Chờ duyệt cấp 1",
  review_l2: "Chờ duyệt cấp 2",
  approved: "Đã duyệt",
  changes_requested: "Yêu cầu chỉnh sửa",
  superseded: "Đã thay thế",
};

const nextStepByStatus: Record<PlanStatus, string> = {
  draft: "Tiếp tục hoàn thiện kế hoạch trước khi gửi duyệt.",
  submitted: "Hồ sơ đã gửi và đang chờ tiếp nhận.",
  review_l1: "Hồ sơ đang chờ duyệt cấp 1.",
  review_l2: "Hồ sơ đang chờ duyệt cấp 2.",
  approved: "Kế hoạch đã duyệt; tiếp tục theo dõi lịch cung ứng.",
  changes_requested: "Cần chỉnh sửa hồ sơ trước khi gửi lại.",
  superseded: "Phiên bản này đã được thay thế.",
};

export function DashboardWorkflowStatus({ version }: DashboardWorkflowStatusProps) {
  return (
    <section className="dashboard-workflow" aria-labelledby="dashboard-workflow-title">
      <div>
        <p className="section-index">Quy trình kế hoạch</p>
        <h2 id="dashboard-workflow-title">Phiên bản {version.versionNumber} · {statusLabels[version.status]}</h2>
      </div>
      <p>{nextStepByStatus[version.status]}</p>
    </section>
  );
}
