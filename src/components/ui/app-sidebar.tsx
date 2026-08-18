import Image from "next/image";
import { BrandSwitcher } from "@/components/navigation/brand-switcher";
import { NavigationLink } from "@/components/navigation/navigation-link";
import {
  resolveNavigationGroups,
  type NavigationGroup,
} from "@/components/navigation/navigation-model";
import type { CurrentAccessV2 } from "@/features/auth/access-types";

interface AppSidebarProps {
  access: CurrentAccessV2;
  navigationGroups?: readonly NavigationGroup[];
}

const tierLabels = {
  employee_viewer: "Nhân viên xem",
  leader: "Trưởng nhóm",
  manager: "Quản lý",
  executive: "CEO / BOD",
} as const;

export function AppSidebar({ access, navigationGroups }: AppSidebarProps) {
  const visibleGroups = navigationGroups ?? resolveNavigationGroups(access);
  const navigationItems = visibleGroups.flatMap((group) => group.items);

  return (
    <aside className="app-sidebar">
      <div className="brand-lockup">
        <Image
          className="brand-symbol"
          src="/brand/sagen-symbol.png"
          width={42}
          height={42}
          alt=""
          aria-hidden="true"
          priority
          unoptimized
        />
        <div className="brand-lockup__copy">
          <Image
            className="brand-wordmark"
            src="/brand/sagen-wordmark.png"
            width={118}
            height={59}
            alt="Sagen Group"
            priority
            unoptimized
          />
          <p className="brand-product">Trung tâm lập kế hoạch</p>
        </div>
      </div>

      <BrandSwitcher access={access} id="sidebar-brand" />

      <nav className="primary-navigation" aria-label="Điều hướng chính">
        {visibleGroups.map((group) => (
          <section key={group.label} className="primary-navigation__group">
            <p className="navigation-label">{group.label}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavigationLink
                    item={item}
                    items={navigationItems}
                    access={access}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="sidebar-user">
        <span className="presence-dot" aria-hidden="true" />
        <div>
          <p>{access.displayName}</p>
          <p className="sidebar-user__roles">
            {access.isAdministrator
              ? `${tierLabels[access.tier]} · Quản trị hệ thống`
              : tierLabels[access.tier]}
          </p>
        </div>
      </div>
    </aside>
  );
}
