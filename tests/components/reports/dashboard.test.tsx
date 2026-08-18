import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardKpis } from "@/features/reports/components/dashboard-kpis";
import { DashboardExecutiveSummary } from "@/features/reports/components/dashboard-executive-summary";
import { DashboardHealthCards } from "@/features/reports/components/dashboard-health-cards";
import { DashboardPriorityList } from "@/features/reports/components/dashboard-priority-list";
import { DashboardSupplyPreview } from "@/features/reports/components/dashboard-supply-preview";
import { DashboardWorkflowStatus } from "@/features/reports/components/dashboard-workflow-status";
import { PoTimeline } from "@/features/reports/components/po-timeline";
import type { PlanningWorkspaceView } from "@/features/planning/planning-types";
import type { DashboardInsightView, DashboardKpiView } from "@/features/reports/report-types";

const getCurrentAccess = vi.fn();
const createServerSupabaseClient = vi.fn();
const loadDashboard = vi.fn();
const loadRoleDashboard = vi.fn();
const getOrganizationContext = vi.fn();

vi.mock("@/features/auth/server/get-current-access", () => ({ getCurrentAccess }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/features/reports/server/load-dashboard", () => ({ loadDashboard }));
vi.mock("@/features/dashboard/server/load-role-dashboard", () => ({ loadRoleDashboard }));
vi.mock("@/features/organization/server/get-organization-context", () => ({ getOrganizationContext }));

const access = {
  displayName: "Planner",
  roles: ["planner"],
  brands: [{ id: "brand-etx", code: "ETX", name: "Etiaxil" }],
  activeBrandId: "brand-etx",
};

const cycle = {
  id: "cycle-etx",
  brand_id: "brand-etx",
  code: "ETX-2026",
  name: "Kế hoạch ETX 2026",
  planning_year: 2026,
};

const plan = {
  brand: { code: "ETX" },
  cycle: {
    id: cycle.id,
    code: cycle.code,
    name: cycle.name,
    planningYear: cycle.planning_year,
    currencyCode: "EUR",
    targetPurchaseAmount: "100000",
  },
  version: {
    id: "version-1",
    versionNumber: 3,
    status: "draft",
    lockVersion: 1,
    updatedAt: "2026-08-14T04:07:00.000Z",
  },
  canEdit: true,
  rows: [],
} satisfies PlanningWorkspaceView;

const commandCenterKpis: DashboardKpiView = {
  targetAmount: 100000,
  committedAmount: 125000,
  gapAmount: -25000,
  criticalCount: 2,
  actionableSkuCount: 3,
  poCount: 2,
};

const commandCenterInsights: DashboardInsightView = {
  totalRecommendedQty: 785537,
  topPriorityRows: [
    {
      planLineId: "line-critical",
      sku: "ET-015025",
      productName: "Đặc trị xanh",
      recommendedQty: 681466,
      severity: "critical",
    },
  ],
  batchStatusCounts: { planned: 1, submitted: 0, confirmed: 1, received: 0 },
  nextEtaDate: "2026-08-20",
  budgetUtilization: 125,
};

function cyclesClient() {
  const order = vi.fn().mockResolvedValue({ data: [cycle] });
  const eqActive = vi.fn().mockReturnValue({ order });
  const eqBrand = vi.fn().mockReturnValue({ eq: eqActive });
  const select = vi.fn().mockReturnValue({ eq: eqBrand });
  return { from: vi.fn().mockReturnValue({ select }) };
}

describe("DashboardKpis", () => {
  it("shows the four approved operational metrics", () => {
    render(
      <DashboardKpis
        currencyCode="EUR"
        kpis={{
          targetAmount: 100000,
          committedAmount: 29600,
          gapAmount: 70400,
          criticalCount: 1,
          actionableSkuCount: 2,
          poCount: 2,
        }}
      />,
    );

    expect(screen.getByText("Ngân sách mục tiêu")).toBeVisible();
    expect(screen.getByText("Đã lên PO")).toBeVisible();
    expect(screen.getByText("Ngân sách còn lại")).toBeVisible();
    expect(screen.getByText("SKU cần xử lý")).toBeVisible();
    expect(screen.getByText("2 SKU")).toBeVisible();
    expect(screen.getByText(/29\.600.*€/)).toBeVisible();
    expect(screen.getAllByRole("term")).toHaveLength(4);
    expect(
      screen.getByRole("progressbar", { name: "Mức sử dụng ngân sách" }),
    ).toHaveAttribute("value", "29.6");
    expect(screen.getByText("Đã sử dụng 29,6% ngân sách")).toBeVisible();
    expect(screen.queryByText("Khoảng trống")).not.toBeInTheDocument();
    expect(screen.queryByText("Lịch mua")).not.toBeInTheDocument();
  });
});

describe("Dashboard command center", () => {
  it("summarizes the highest-priority state and exposes data freshness", () => {
    render(
      <DashboardExecutiveSummary
        plan={plan}
        kpis={commandCenterKpis}
        insights={commandCenterInsights}
        planningHref="/planning/ETX-2026?brandId=brand-etx&cycleId=cycle-etx"
      />,
    );

    const summary = screen.getByRole("region", { name: "Tóm tắt điều hành" });
    expect(summary).toHaveTextContent("Ngân sách đã vượt");
    expect(summary).toHaveTextContent("Cập nhật 11:07 14/08/2026");
    expect(screen.getByRole("link", { name: "Mở kế hoạch mua hàng" })).toBeVisible();
  });

  it("shows exactly three understandable health cards with real utilization", () => {
    render(
      <DashboardHealthCards
        currencyCode="EUR"
        kpis={commandCenterKpis}
        insights={commandCenterInsights}
      />,
    );

    const health = screen.getByRole("region", { name: "Sức khỏe kế hoạch" });
    expect(health).toHaveTextContent("Hàng hóa");
    expect(health).toHaveTextContent("Ngân sách");
    expect(health).toHaveTextContent("Cung ứng");
    expect(screen.getAllByTestId("dashboard-health-card")).toHaveLength(3);
    expect(screen.getByText("125% ngân sách đã sử dụng")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Mức sử dụng ngân sách" })).toHaveAttribute(
      "value",
      "100",
    );
    expect(screen.getByText("Ngày hàng về gần nhất 20/08/2026")).toBeVisible();
  });

  it("explains when the target budget has not been configured", () => {
    render(
      <DashboardExecutiveSummary
        plan={plan}
        kpis={{ ...commandCenterKpis, targetAmount: 0, gapAmount: -125000 }}
        insights={{ ...commandCenterInsights, budgetUtilization: 0 }}
        planningHref="/planning/ETX-2026?brandId=brand-etx&cycleId=cycle-etx"
      />,
    );

    expect(screen.getByText("Chưa thiết lập ngân sách mục tiêu.")).toBeVisible();
  });

  it("limits the priority queue and links directly to the selected product", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      planLineId: `line-${index}`,
      sku: `ET-${index}`,
      productName: `Tên sản phẩm rất dài ${index}`,
      recommendedQty: 700 - index,
      severity: index < 2 ? "critical" as const : "warning" as const,
    }));

    render(
      <DashboardPriorityList
        rows={rows}
        planningHref="/planning/ETX-2026?brandId=brand-etx&cycleId=cycle-etx"
      />,
    );

    expect(screen.getAllByRole("link", { name: "Xử lý" })).toHaveLength(5);
    expect(screen.getAllByRole("link", { name: "Xử lý" })[0]).toHaveAttribute(
      "href",
      "/planning/ETX-2026?brandId=brand-etx&cycleId=cycle-etx&lineId=line-0",
    );
    expect(screen.queryByText("ET-6")).not.toBeInTheDocument();
  });

  it("shows only the three nearest supply milestones", () => {
    const batches = Array.from({ length: 4 }, (_, index) => ({
      id: `batch-${index}`,
      batchNumber: index + 1,
      name: `Đợt mua ${index + 1}`,
      orderDate: "2026-08-10",
      etaDate: `2026-09-0${4 - index}`,
      status: "planned" as const,
      amount: 1000 * (index + 1),
      lineCount: index + 1,
    }));

    render(
      <DashboardSupplyPreview
        batches={batches}
        currencyCode="EUR"
        supplyHref="/planning/ETX-2026?brandId=brand-etx&cycleId=cycle-etx&step=po"
        planningHref="/planning/ETX-2026?brandId=brand-etx&cycleId=cycle-etx"
      />,
    );

    expect(screen.getAllByRole("article", { name: /Đợt mua/ })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Xem toàn bộ lịch cung ứng" })).toHaveAttribute(
      "href",
      expect.stringContaining("step=po"),
    );
    expect(screen.queryByText("Đợt mua 1")).not.toBeInTheDocument();
  });

  it("explains the next workflow step in Vietnamese", () => {
    render(<DashboardWorkflowStatus version={plan.version} />);

    expect(screen.getByText("Tiếp tục hoàn thiện kế hoạch trước khi gửi duyệt.")).toBeVisible();
    expect(screen.getByText("Phiên bản 3 · Bản nháp")).toBeVisible();
  });
});

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.resetModules();
    getCurrentAccess.mockReset().mockResolvedValue(access);
    createServerSupabaseClient.mockReset().mockResolvedValue(cyclesClient());
    loadDashboard.mockReset().mockResolvedValue({
      plan,
      kpis: commandCenterKpis,
      insights: commandCenterInsights,
      batches: [
        {
          id: "batch-1",
          batchNumber: 1,
          name: "Đợt mua tháng 9",
          orderDate: "2026-08-15",
          etaDate: "2026-09-15",
          status: "planned",
          amount: 29600,
          lineCount: 2,
        },
      ],
    });
    getOrganizationContext.mockReset().mockResolvedValue({
      userId: "90000000-0000-0000-0000-000000000101",
      displayName: "Planner",
      tier: "manager",
      isAdministrator: false,
      capabilities: ["view_approved_plan", "create_purchase_proposal"],
      supervisorId: null,
      executiveId: null,
      brands: [{ id: "brand-etx", code: "ETX", name: "Etiaxil", capabilities: ["view_approved_plan", "create_purchase_proposal"], sources: ["direct"] }],
    });
    loadRoleDashboard.mockReset().mockResolvedValue({
      context: { brandId: "brand-etx", brandCode: "ETX", planningYear: 2026, tier: "manager" },
      displayName: "Planner",
      canViewBaseline: true,
      actions: [{ id: "proposal-1", kind: "approval", title: "Có đề xuất cần xử lý", detail: "Kiểm tra đề xuất và chọn PO ghi nhận.", href: "/proposals/proposal-1", dueLabel: "Cần xử lý" }],
      metrics: [
        { key: "baseline", label: "Ngân sách kế hoạch", amount: "100.000,00 €", context: "1 SKU trong baseline đã duyệt", progress: 20 },
        { key: "allocated", label: "Đã phân bổ vào PO", amount: "20.000,00 €", context: "20% ngân sách đã gắn vào đợt mua", progress: 20 },
        { key: "approved_proposals", label: "Đề xuất đã duyệt", amount: "0,00 €", context: "0 đề xuất", progress: null },
        { key: "over_plan", label: "Vượt phần còn lại", amount: "0,00 €", context: "Chưa có ngoại lệ vượt kế hoạch", progress: null },
      ],
      waves: [{ id: "wave-1", name: "PO #1", arrivalMonth: "2026-03", usedUnits: 20, plannedUnits: 100, progress: 20, status: "ordered", officialPoNumber: "PO-2026-001" }],
      exceptions: [],
    });
  });

  it("composes the role dashboard with scoped metrics, wave progress and operational actions", async () => {
    const { default: DashboardPage } = await import("@/app/(app)/dashboard/page");

    render(
      await DashboardPage({
        searchParams: Promise.resolve({ brandId: "brand-etx", cycleId: cycle.id }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1, name: "Tổng quan vận hành" })).toBeVisible();
    expect(screen.getByRole("form", { name: "Phạm vi tổng quan" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Việc cần xử lý" })).toHaveTextContent("Có đề xuất cần xử lý");
    expect(screen.getByRole("region", { name: "Sức khỏe kế hoạch" })).toHaveTextContent("Ngân sách kế hoạch");
    expect(screen.getByRole("region", { name: "Tiến độ đợt mua" })).toHaveTextContent("PO #1");
    expect(screen.getByRole("region", { name: "Ngoại lệ cần lưu ý" })).toHaveTextContent("Chưa có ngoại lệ đáng chú ý");
    expect(screen.getByRole("link", { name: "Xuất kế hoạch đã duyệt" })).toHaveAttribute(
      "href",
      "/api/v2/reports/approved-plan?brandId=brand-etx&planningYear=2026",
    );
    expect(screen.queryByText("Forecast 5M")).not.toBeInTheDocument();
    expect(screen.queryByText("Import dữ liệu")).not.toBeInTheDocument();
  });
});

describe("PoTimeline", () => {
  it("shows dynamic PO waves and their operational status", () => {
    render(
      <PoTimeline
        currencyCode="EUR"
        batches={[
          {
            id: "po-1",
            batchNumber: 1,
            name: "PO #1",
            orderDate: "2026-01-05",
            etaDate: "2026-02-10",
            status: "confirmed",
            amount: 12525,
            lineCount: 12,
          },
          {
            id: "po-2",
            batchNumber: 2,
            name: "PO bổ sung Critical",
            orderDate: "2026-08-11",
            etaDate: "2026-09-15",
            status: "planned",
            amount: 29600,
            lineCount: 1,
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "PO #1" })).toBeVisible();
    expect(screen.getByText("PO bổ sung Critical")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Lịch cung ứng" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Đợt mua & ngày hàng về" })).toBeNull();
    expect(screen.getByRole("article", { name: "PO #1 · PO #1" })).toBeVisible();
    expect(screen.getByText("10/02/2026")).toBeVisible();
    expect(screen.getByText(/12\.525.*€/)).toBeVisible();
    expect(screen.getAllByText("Đã xác nhận").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dự kiến").length).toBeGreaterThan(0);
  });
});
