import { describe, expect, it } from "vitest";
import {
  buildBrandSwitchHref,
  buildNavigationHref,
  navigationGroups,
  resolveActiveNavigation,
  resolveNavigationGroups,
} from "@/components/navigation/navigation-model";
import type { CurrentAccessV2 } from "@/features/auth/access-types";

const brand = (id: string, capabilities: CurrentAccessV2["brands"][number]["capabilities"] = []) => ({
  id,
  code: id.toUpperCase(),
  name: id,
  capabilities,
  sources: ["direct"],
});

function access(overrides: Partial<CurrentAccessV2> = {}): CurrentAccessV2 {
  return {
    userId: "10000000-0000-0000-0000-000000000001",
    displayName: "Người dùng V2",
    tier: "employee_viewer",
    isAdministrator: false,
    capabilities: [],
    supervisorId: null,
    executiveId: null,
    brands: [brand("etx")],
    ...overrides,
  };
}

describe("V2 navigation model", () => {
  it("exposes only the Vietnamese V2 destinations", () => {
    expect(navigationGroups.map((group) => group.label)).toEqual([
      "Công việc",
      "Kế hoạch & thực hiện",
      "Hệ thống",
    ]);
    expect(navigationGroups.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/dashboard",
      "/approvals",
      "/notifications",
      "/annual-plans",
      "/purchase-waves",
      "/proposals",
      "/master-data/brands",
      "/master-data/products",
      "/admin/approval-policies",
      "/admin/users",
    ]);
  });

  it("filters the menu by tier and capability without exposing unauthorized modules", () => {
    const leader = resolveNavigationGroups(access({
      tier: "leader",
      capabilities: ["create_purchase_proposal"],
    }));
    expect(leader.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/dashboard",
      "/notifications",
      "/proposals",
    ]);

    const manager = resolveNavigationGroups(access({
      tier: "manager",
      capabilities: ["create_annual_plan", "view_approved_plan"],
    }));
    expect(manager.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/dashboard",
      "/approvals",
      "/notifications",
      "/annual-plans",
      "/purchase-waves",
      "/proposals",
    ]);

    const executive = resolveNavigationGroups(access({
      tier: "executive",
      capabilities: ["create_annual_plan", "view_approved_plan"],
    }));
    expect(executive.flatMap((group) => group.items.map((item) => item.href))).toEqual(
      manager.flatMap((group) => group.items.map((item) => item.href)),
    );

    const administrator = resolveNavigationGroups(access({
      isAdministrator: true,
      capabilities: ["administer_system", "manage_master_data"],
    }));
    expect(administrator.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/dashboard",
      "/notifications",
      "/master-data/brands",
      "/master-data/products",
      "/admin/approval-policies",
      "/admin/users",
    ]);

    const viewer = resolveNavigationGroups(access());
    expect(viewer.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/dashboard",
      "/notifications",
    ]);
  });

  it("keeps exactly one active item for nested V2 routes", () => {
    const groups = resolveNavigationGroups(access({
      tier: "manager",
      capabilities: ["create_annual_plan", "view_approved_plan", "manage_master_data"],
    }));
    const items = groups.flatMap((group) => group.items);
    const active = resolveActiveNavigation("/annual-plans/new", items);
    expect(active).toBe("/annual-plans");
    expect(items.filter((item) => item.href === active)).toHaveLength(1);
    expect(resolveActiveNavigation("/master-data/products/sku-id", items)).toBe(
      "/master-data/products",
    );
  });

  it("preserves an authorized brand context across V2 navigation", () => {
    const item = navigationGroups
      .flatMap((group) => group.items)
      .find((candidate) => candidate.href === "/annual-plans")!;
    expect(buildNavigationHref(item, "brand-abc")).toBe(
      "/annual-plans?brandId=brand-abc",
    );
    expect(buildBrandSwitchHref("/annual-plans/new", "brand-abc", "year=2027")).toBe(
      "/annual-plans/new?year=2027&brandId=brand-abc",
    );
  });
});
