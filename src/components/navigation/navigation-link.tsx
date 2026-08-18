"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildNavigationHref,
  resolveActiveNavigation,
  type NavigationItem,
} from "@/components/navigation/navigation-model";
import {
  resolveActiveBrandId,
  type CurrentAccessV2,
} from "@/features/auth/access-types";

interface NavigationLinkProps {
  item: NavigationItem;
  items: readonly NavigationItem[];
  access: CurrentAccessV2;
  onNavigate?: () => void;
}

export function NavigationLink({
  item,
  items,
  access,
  onNavigate,
}: NavigationLinkProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const activeBrandId = resolveActiveBrandId(
    access.brands,
    searchParams.get("brandId"),
  );
  const isActive =
    resolveActiveNavigation(pathname, items, searchParams.toString()) === item.href;

  return (
    <Link
      href={buildNavigationHref(item, activeBrandId)}
      aria-current={isActive ? "page" : undefined}
      className={isActive ? "navigation-link navigation-link--active" : "navigation-link"}
      onClick={onNavigate}
    >
      <span>{item.label}</span>
    </Link>
  );
}
