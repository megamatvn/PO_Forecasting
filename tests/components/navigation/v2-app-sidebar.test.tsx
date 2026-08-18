import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/ui/app-sidebar";
import type { CurrentAccessV2 } from "@/features/auth/access-types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/annual-plans/new",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("brandId=10000000-0000-0000-0000-000000000001"),
}));

const access: CurrentAccessV2 = {
  userId: "10000000-0000-0000-0000-000000000001",
  displayName: "Manager An",
  tier: "manager",
  isAdministrator: false,
  capabilities: ["create_annual_plan", "view_approved_plan"],
  supervisorId: "10000000-0000-0000-0000-000000000002",
  executiveId: "10000000-0000-0000-0000-000000000003",
  brands: [{
    id: "10000000-0000-0000-0000-000000000001",
    code: "ETX",
    name: "Etiaxil",
    capabilities: ["create_annual_plan", "view_approved_plan"],
    sources: ["direct"],
  }],
};

describe("AppSidebar V2", () => {
  it("renders the selected V2 route with one aria-current marker", () => {
    render(<AppSidebar access={access} />);
    expect(screen.getByRole("link", { name: "Kế hoạch mua hàng" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Forecast Planning/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Lịch sử phiên bản/i })).not.toBeInTheDocument();
    expect(screen.getByText("Quản lý")).toBeVisible();
  });

  it("does not show system administration to a manager", () => {
    render(<AppSidebar access={access} />);
    expect(screen.queryByRole("link", { name: "Người dùng & quyền" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dữ liệu nền · Nhãn hàng" })).not.toBeInTheDocument();
  });
});
