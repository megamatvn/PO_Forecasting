import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoleDashboard } from "@/features/dashboard/components/role-dashboard";
import type { RoleDashboardDTO } from "@/features/dashboard/contracts";

describe("RoleDashboard", () => {
  it("puts decisions before metrics and explains the selected scope", () => {
    const data: RoleDashboardDTO = {
      context: { brandId: "brand-etx", brandCode: "ETX", planningYear: 2026, tier: "manager" },
      displayName: "Lan",
      actions: [{ id: "proposal-1", kind: "approval", title: "Duyệt đề xuất ET-015025", detail: "Đang chờ bạn chọn PO ghi nhận.", href: "/proposals/proposal-1", dueLabel: "Cần xử lý" }],
      metrics: [
        { key: "baseline", label: "Ngân sách kế hoạch", amount: "250,00 €", context: "Kế hoạch đã duyệt", progress: 100 },
        { key: "allocated", label: "Đã phân bổ vào PO", amount: "100,00 €", context: "40% ngân sách", progress: 40 },
        { key: "approved_proposals", label: "Đề xuất đã duyệt", amount: "150,00 €", context: "1 đề xuất", progress: null },
        { key: "over_plan", label: "Vượt phần còn lại", amount: "150,00 €", context: "Cần xem xét", progress: null },
      ],
      waves: [{ id: "wave-1", name: "PO #1", arrivalMonth: "2026-02", usedUnits: 40, plannedUnits: 120, progress: 33, status: "ordered", officialPoNumber: "PO-2026-001" }],
      exceptions: [{ id: "exception-1", severity: "critical", title: "Đề xuất vượt phần còn lại của PO #1", detail: "Cần kiểm tra trước khi tiếp tục.", href: "/proposals/proposal-1" }],
      canViewBaseline: true,
    };

    render(<RoleDashboard data={data} />);
    expect(screen.getByRole("heading", { name: "Xin chào, Lan" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Việc cần xử lý" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Sức khỏe kế hoạch" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Tiến độ đợt mua" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Ngoại lệ cần lưu ý" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Duyệt đề xuất ET-015025" })).toHaveAttribute("href", "/proposals/proposal-1");
  });
});
