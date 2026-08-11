import Link from "next/link";
import type { CurrentAccess } from "@/features/auth/access-types";
import { canPerform } from "@/features/auth/permissions";

interface AppSidebarProps {
  access: CurrentAccess;
}

interface NavigationItem {
  href: string;
  label: string;
  marker: string;
  visible: boolean;
}

const roleLabels = {
  administrator: "Administrator",
  planner: "Planner / Buyer",
  approver_l1: "Approver L1",
  approver_l2: "Approver L2",
  viewer: "Viewer / Auditor",
} as const;

export function AppSidebar({ access }: AppSidebarProps) {
  const roles = new Set(access.roles);
  const canView = canPerform(roles, "view");
  const canApprove =
    canPerform(roles, "approve_l1") || canPerform(roles, "approve_l2");
  const canAdminister = canPerform(roles, "administer");

  const navigation: NavigationItem[] = [
    { href: "/dashboard", label: "Tổng quan", marker: "01", visible: canView },
    {
      href: "/planning",
      label: "Forecast Planning",
      marker: "02",
      visible: canView,
    },
    {
      href: "/imports",
      label: "Import dữ liệu",
      marker: "03",
      visible: canAdminister,
    },
    {
      href: "/approvals",
      label: "Hồ sơ chờ duyệt",
      marker: "04",
      visible: canApprove,
    },
    {
      href: "/versions",
      label: "Lịch sử phiên bản",
      marker: "05",
      visible: canView,
    },
    {
      href: "/admin/approval-policies",
      label: "Chính sách duyệt",
      marker: "06",
      visible: canAdminister,
    },
    {
      href: "/admin/users",
      label: "Người dùng & quyền",
      marker: "07",
      visible: canAdminister,
    },
  ];

  return (
    <aside className="app-sidebar">
      <div className="brand-lockup">
        <span className="brand-monogram" aria-hidden="true">
          S
        </span>
        <div>
          <p className="brand-name">Sagen Groupe</p>
          <p className="brand-product">PO Forecasting</p>
        </div>
      </div>

      <form className="brand-picker" action="/dashboard" method="get">
        <label htmlFor="sidebar-brand">Nhãn hàng</label>
        <div className="brand-picker__control">
          <select
            id="sidebar-brand"
            name="brandId"
            aria-label="Nhãn hàng"
            defaultValue={access.activeBrandId ?? ""}
          >
            {access.brands.length === 0 ? (
              <option value="">Chưa được cấp nhãn hàng</option>
            ) : null}
            {access.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.code} · {brand.name}
              </option>
            ))}
          </select>
          <button type="submit" aria-label="Áp dụng nhãn hàng">
            ↗
          </button>
        </div>
      </form>

      <nav className="primary-navigation" aria-label="Điều hướng chính">
        <p className="navigation-label">Workspace</p>
        <ul>
          {navigation
            .filter((item) => item.visible)
            .map((item) => (
              <li key={item.href}>
                <Link href={item.href}>
                  <span className="nav-marker" aria-hidden="true">
                    {item.marker}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
        </ul>
      </nav>

      <div className="sidebar-user">
        <span className="presence-dot" aria-hidden="true" />
        <div>
          <p>{access.displayName}</p>
          <p className="sidebar-user__roles">
            {access.roles.map((role) => roleLabels[role]).join(" · ") || "Chưa có vai trò"}
          </p>
        </div>
      </div>
    </aside>
  );
}
