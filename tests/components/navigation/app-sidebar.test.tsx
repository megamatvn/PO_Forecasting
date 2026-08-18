import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/ui/app-sidebar";
import type { CurrentAccessV2 } from "@/features/auth/access-types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/annual-plans/new",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const etxBrand: CurrentAccessV2["brands"][number] = {
  id: "10000000-0000-0000-0000-000000000001",
  code: "ETX",
  name: "Etiaxil",
  capabilities: ["create_annual_plan", "view_approved_plan"],
  sources: ["direct"],
};

const manager: CurrentAccessV2 = {
  userId: "10000000-0000-0000-0000-000000000001",
  displayName: "Manager An",
  tier: "manager",
  isAdministrator: false,
  capabilities: ["create_annual_plan", "view_approved_plan"],
  supervisorId: "10000000-0000-0000-0000-000000000002",
  executiveId: "10000000-0000-0000-0000-000000000003",
  brands: [etxBrand],
};

describe("AppSidebar", () => {
  it("marks the current V2 route exactly once", () => {
    render(<AppSidebar access={manager} />);
    expect(screen.getByRole("link", { name: "Kế hoạch mua hàng" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Forecast/i })).not.toBeInTheDocument();
  });

  it("shows operational links for a manager and hides administration", () => {
    render(<AppSidebar access={manager} />);
    expect(screen.getByRole("link", { name: "Hộp việc duyệt" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Đề xuất nhập hàng" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Người dùng & quyền" })).not.toBeInTheDocument();
    expect(screen.getByText("Quản lý")).toBeVisible();
  });

  it("shows system links only for an administrator", () => {
    const administrator: CurrentAccessV2 = {
      ...manager,
      tier: "employee_viewer",
      isAdministrator: true,
      capabilities: ["administer_system", "manage_master_data"],
    };
    render(<AppSidebar access={administrator} />);
    expect(screen.getByRole("link", { name: "Dữ liệu nền · Nhãn hàng" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Người dùng & quyền" })).toBeVisible();
    expect(screen.getByText("Nhân viên xem · Quản trị hệ thống")).toBeVisible();
  });
});
