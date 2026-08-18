import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { MobileNavigation } from "@/components/navigation/mobile-navigation";
import { resolveNavigationGroups } from "@/components/navigation/navigation-model";
import type { CurrentAccessV2 } from "@/features/auth/access-types";

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/annual-plans/new",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const access: CurrentAccessV2 = {
  userId: "10000000-0000-0000-0000-000000000001",
  displayName: "Manager An",
  tier: "manager",
  isAdministrator: false,
  capabilities: ["create_annual_plan", "view_approved_plan"],
  supervisorId: null,
  executiveId: null,
  brands: [{
    id: "10000000-0000-0000-0000-000000000001",
    code: "ETX",
    name: "Etiaxil",
    capabilities: ["create_annual_plan", "view_approved_plan"],
    sources: ["direct"],
  }],
};

describe("MobileNavigation", () => {
  it("closes the drawer with Escape and returns focus to the menu button", async () => {
    const user = userEvent.setup();
    render(
      <MobileNavigation
        access={access}
        navigationGroups={resolveNavigationGroups(access)}
      />,
    );

    const menuButton = screen.getByRole("button", { name: "Mở menu điều hướng" });
    await user.click(menuButton);
    expect(screen.getByRole("dialog", { name: "Điều hướng chính" })).toBeVisible();
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Điều hướng chính" })).toBeNull();
    expect(menuButton).toHaveFocus();
  });

  it("uses the V2 module name in the mobile header", () => {
    render(
      <MobileNavigation
        access={access}
        navigationGroups={resolveNavigationGroups(access)}
      />,
    );
    expect(screen.getByText("Kế hoạch mua hàng")).toBeVisible();
    expect(screen.queryByText(/Forecast/i)).not.toBeInTheDocument();
  });
});
