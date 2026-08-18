import Link from "next/link";
import type { PlanningWorkspaceView } from "@/features/planning/planning-types";
import type {
  DashboardInsightView,
  DashboardKpiView,
} from "@/features/reports/report-types";

interface DashboardExecutiveSummaryProps {
  plan: PlanningWorkspaceView;
  kpis: DashboardKpiView;
  insights: DashboardInsightView;
  planningHref: string;
}

const updatedAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour12: false,
  timeZone: "Asia/Ho_Chi_Minh",
});

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Chưa xác định thời điểm cập nhật"
    : `Cập nhật ${updatedAtFormatter.format(date).replace(",", "")}`;
}

function resolveSummary(
  kpis: DashboardKpiView,
  insights: DashboardInsightView,
) {
  if (kpis.targetAmount <= 0) {
    return {
      tone: "attention",
      eyebrow: "Cần hoàn thiện dữ liệu",
      title: "Chưa thiết lập ngân sách mục tiêu.",
      description:
        "Hãy bổ sung ngân sách để hệ thống đánh giá chính xác mức cam kết và phần còn lại.",
    } as const;
  }
  if (kpis.gapAmount < 0) {
    return {
      tone: "critical",
      eyebrow: "Cần kiểm soát ngân sách",
      title: "Ngân sách đã vượt mức mục tiêu.",
      description:
        "Rà soát các đợt mua và số lượng đề xuất trước khi tiếp tục quy trình duyệt.",
    } as const;
  }
  if (kpis.actionableSkuCount > 0) {
    return {
      tone: "attention",
      eyebrow: "Cần xử lý hàng hóa",
      title: `${kpis.actionableSkuCount.toLocaleString("vi-VN")} SKU đang cần bổ sung.`,
      description: `${insights.totalRecommendedQty.toLocaleString("vi-VN")} sản phẩm cần được xem xét trong kế hoạch mua hàng.`,
    } as const;
  }
  if (kpis.poCount === 0) {
    return {
      tone: "attention",
      eyebrow: "Cần lập lịch cung ứng",
      title: "Kế hoạch chưa có đợt mua đang hoạt động.",
      description: "Hãy lập đợt mua và ngày hàng về để hoàn thiện kế hoạch cung ứng.",
    } as const;
  }
  return {
    tone: "positive",
    eyebrow: "Kế hoạch ổn định",
    title: "Kế hoạch đang trong ngân sách và không còn SKU cần bổ sung.",
    description: "Tiếp tục theo dõi lịch cung ứng và trạng thái duyệt của phiên bản này.",
  } as const;
}

export function DashboardExecutiveSummary({
  plan,
  kpis,
  insights,
  planningHref,
}: DashboardExecutiveSummaryProps) {
  const summary = resolveSummary(kpis, insights);

  return (
    <section
      className="dashboard-summary"
      data-tone={summary.tone}
      aria-label="Tóm tắt điều hành"
    >
      <div className="dashboard-summary__content">
        <p className="section-index">{summary.eyebrow}</p>
        <h2>{summary.title}</h2>
        <p>{summary.description}</p>
        <small>{formatUpdatedAt(plan.version.updatedAt)}</small>
      </div>
      <Link className="button button--primary" href={planningHref}>
        Mở kế hoạch mua hàng
      </Link>
    </section>
  );
}
