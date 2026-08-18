import { describe, expect, it } from "vitest";
import {
  buildBrandSwitchHref,
  buildNavigationHref,
  navigationItems,
  resolveActiveNavigation,
  resolveNavigationGroups,
} from "@/components/navigation/navigation-model";
import type { CurrentAccessV2 } from "@/features/auth/access-types";

const manager: CurrentAccessV2 = {
  userId: "10000000-0000-0000-0000-000000000001",
  displayName: "Manager",
  tier: "manager" as const,
  isAdministrator: false,
  capabilities: ["create_annual_plan", "view_approved_plan"],
  supervisorId: null,
  executiveId: null,
  brands: [{
    id: "brand-etx",
    code: "ETX",
    name: "Etiaxil",
    capabilities: ["create_annual_plan", "view_approved_plan"],
    sources: ["direct"],
  }],
};

describe("resolveActiveNavigation", () => {
  it("assigns nested V2 routes to their most specific module", () => {
    expect(resolveActiveNavigation("/annual-plans/abc")).toBe("/annual-plans");
    expect(resolveActiveNavigation("/master-data/products/abc")).toBe(
      "/master-data/products",
    );
  });

  it("does not assign an active item to an unknown route", () => {
    expect(resolveActiveNavigation("/unknown")).toBeNull();
  });

  it("keeps the selected brand in navigation and brand switching", () => {
    const annualPlans = navigationItems.find((item) => item.href === "/annual-plans")!;
    expect(buildNavigationHref(annualPlans, "brand-abc")).toBe(
      "/annual-plans?brandId=brand-abc",
    );
    expect(buildBrandSwitchHref("/annual-plans/new", "brand-abc", "year=2027")).toBe(
      "/annual-plans/new?year=2027&brandId=brand-abc",
    );
  });

  it("filters the V2 menu by the current access context", () => {
    const groups = resolveNavigationGroups(manager);
    expect(groups.map((group) => group.label)).toEqual([
      "Công việc",
      "Kế hoạch & thực hiện",
    ]);
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/dashboard",
      "/approvals",
      "/notifications",
      "/annual-plans",
      "/purchase-waves",
      "/proposals",
    ]);
  });
});
