"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandSwitcher } from "@/components/navigation/brand-switcher";
import { NavigationLink } from "@/components/navigation/navigation-link";
import {
  resolveActiveNavigation,
  type NavigationGroup,
} from "@/components/navigation/navigation-model";
import {
  resolveActiveBrandId,
  type CurrentAccessV2,
} from "@/features/auth/access-types";

interface MobileNavigationProps {
  access: CurrentAccessV2;
  navigationGroups: readonly NavigationGroup[];
}

function moduleLabel(
  pathname: string,
  groups: readonly NavigationGroup[],
  search: string,
): string {
  const items = groups.flatMap((group) => group.items);
  const activeHref = resolveActiveNavigation(pathname, items, search);
  return items.find((item) => item.href === activeHref)?.label ?? "Tổng quan";
}

export function MobileNavigation({
  access,
  navigationGroups,
}: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const activeBrandId = resolveActiveBrandId(
    access.brands,
    searchParams.get("brandId"),
  );
  const navigationItems = navigationGroups.flatMap((group) => group.items);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  function closeDrawer() {
    setIsOpen(false);
    menuButtonRef.current?.focus();
  }

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);

    if (!first || !last) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <header className="mobile-app-header">
        <Image
          className="mobile-app-header__logo"
          src="/brand/sagen-symbol.png"
          width={36}
          height={36}
          alt=""
          aria-hidden="true"
          priority
          unoptimized
        />
        <div className="mobile-app-header__context">
          <strong>{access.brands.find((brand) => brand.id === activeBrandId)?.code ?? "Sagen"}</strong>
          <span>{moduleLabel(pathname, navigationGroups, searchParams.toString())}</span>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          className="mobile-menu-button"
          aria-label="Mở menu điều hướng"
          aria-expanded={isOpen}
          aria-controls="mobile-navigation-drawer"
          onClick={() => setIsOpen(true)}
        >
          <span aria-hidden="true">☰</span>
        </button>
      </header>

      {isOpen ? (
        <div className="mobile-navigation-overlay" onMouseDown={closeDrawer}>
          <aside
            id="mobile-navigation-drawer"
            className="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Điều hướng chính"
            onKeyDown={trapFocus}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mobile-navigation-drawer__header">
              <p>Điều hướng</p>
              <button
                ref={closeButtonRef}
                type="button"
                className="mobile-menu-button"
                aria-label="Đóng menu điều hướng"
                onClick={closeDrawer}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <BrandSwitcher access={access} id="mobile-brand" compact />
            <nav aria-label="Điều hướng chính">
              {navigationGroups.map((group) => (
                <section key={group.label} className="mobile-navigation-group">
                  <p className="navigation-label">{group.label}</p>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <NavigationLink
                          item={item}
                          items={navigationItems}
                          access={access}
                          onNavigate={closeDrawer}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
