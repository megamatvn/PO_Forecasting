import type { CurrentAccessV2 } from "@/features/auth/access-types";
import {
  canUseCapability,
  canUseAnyBrandCapability,
} from "@/features/auth/permissions";
import type { Capability } from "@/features/organization/contracts";

export type NavigationMatch = "exact" | "prefix";
export type NavigationPermission =
  | "dashboard"
  | "approvals"
  | "notifications"
  | "annual_plans"
  | "purchase_waves"
  | "proposals"
  | "master_data"
  | "administration";

export interface NavigationItem {
  href: string;
  label: string;
  match: NavigationMatch;
  permission: NavigationPermission;
}

export interface NavigationGroup {
  label: "Công việc" | "Kế hoạch & thực hiện" | "Hệ thống";
  items: readonly NavigationItem[];
}

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Công việc",
    items: [
      { href: "/dashboard", label: "Tổng quan", match: "exact", permission: "dashboard" },
      { href: "/approvals", label: "Hộp việc duyệt", match: "prefix", permission: "approvals" },
      { href: "/notifications", label: "Thông báo", match: "prefix", permission: "notifications" },
    ],
  },
  {
    label: "Kế hoạch & thực hiện",
    items: [
      { href: "/annual-plans", label: "Kế hoạch mua hàng", match: "prefix", permission: "annual_plans" },
      { href: "/purchase-waves", label: "Đợt mua & ngày hàng về", match: "prefix", permission: "purchase_waves" },
      { href: "/proposals", label: "Đề xuất nhập hàng", match: "prefix", permission: "proposals" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { href: "/master-data/brands", label: "Dữ liệu nền · Nhãn hàng", match: "prefix", permission: "master_data" },
      { href: "/master-data/products", label: "Dữ liệu nền · SKU", match: "prefix", permission: "master_data" },
      { href: "/admin/approval-policies", label: "Chính sách duyệt", match: "exact", permission: "administration" },
      { href: "/admin/users", label: "Người dùng & quyền", match: "exact", permission: "administration" },
    ],
  },
] as const;

export const navigationItems = navigationGroups.flatMap((group) => group.items);

function hasCapability(access: CurrentAccessV2, capability: Capability): boolean {
  return (
    canUseCapability(access.capabilities, capability) ||
    canUseAnyBrandCapability(access.brands, capability)
  );
}

function canSeePermission(
  access: CurrentAccessV2,
  permission: NavigationPermission,
): boolean {
  switch (permission) {
    case "dashboard":
    case "notifications":
      return true;
    case "approvals":
      return access.tier === "manager" || access.tier === "executive";
    case "annual_plans":
      return (
        access.tier === "manager" ||
        access.tier === "executive" ||
        hasCapability(access, "create_annual_plan") ||
        hasCapability(access, "view_approved_plan")
      );
    case "purchase_waves":
      return (
        access.tier === "manager" ||
        access.tier === "executive" ||
        hasCapability(access, "view_approved_plan")
      );
    case "proposals":
      return (
        access.tier === "manager" ||
        access.tier === "executive" ||
        hasCapability(access, "create_purchase_proposal")
      );
    case "master_data":
      return access.isAdministrator || hasCapability(access, "manage_master_data");
    case "administration":
      return access.isAdministrator || hasCapability(access, "administer_system");
  }
}

export function resolveNavigationGroups(
  access: CurrentAccessV2,
  groups = navigationGroups,
): NavigationGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeePermission(access, item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

export function resolveActiveNavigation(
  pathname: string,
  items: readonly NavigationItem[] = navigationItems,
  search = "",
): string | null {
  const searchParams = new URLSearchParams(search);

  return (
    items
      .filter((item) => {
        const itemPathname = item.href.split("?", 1)[0];
        const pathnameMatches =
          item.match === "exact"
            ? pathname === itemPathname
            : pathname === itemPathname || pathname.startsWith(`${itemPathname}/`);
        const itemQuery = new URLSearchParams(item.href.split("?", 2)[1] ?? "");
        const queryMatches = [...itemQuery.entries()].every(
          ([key, value]) => searchParams.get(key) === value,
        );

        return pathnameMatches && queryMatches;
      })
      .sort((a, b) => {
        const pathLength =
          b.href.split("?", 1)[0].length - a.href.split("?", 1)[0].length;
        if (pathLength !== 0) return pathLength;
        return b.href.length - a.href.length;
      })[0]?.href ?? null
  );
}

const brandScopedModules = [
  "/dashboard",
  "/annual-plans",
  "/proposals",
  "/purchase-waves",
  "/approvals",
  "/master-data/brands",
  "/master-data/products",
] as const;

function isBrandScopedPath(pathname: string): boolean {
  return brandScopedModules.some(
    (modulePath) => pathname === modulePath || pathname.startsWith(`${modulePath}/`),
  );
}

export function buildNavigationHref(
  item: NavigationItem,
  brandId: string | null,
): string {
  if (!brandId) return item.href;

  const [pathname, search = ""] = item.href.split("?", 2);
  if (!isBrandScopedPath(pathname)) return item.href;

  const searchParams = new URLSearchParams(search);
  searchParams.set("brandId", brandId);
  return `${pathname}?${searchParams.toString()}`;
}

export function buildBrandSwitchHref(
  pathname: string,
  brandId: string,
  search = "",
): string {
  const targetPathname = isBrandScopedPath(pathname) ? pathname : "/dashboard";
  const searchParams = isBrandScopedPath(pathname)
    ? new URLSearchParams(search)
    : new URLSearchParams();
  searchParams.set("brandId", brandId);
  return `${targetPathname}?${searchParams.toString()}`;
}
