"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { buildBrandSwitchHref } from "@/components/navigation/navigation-model";
import {
  resolveActiveBrandId,
  type CurrentAccessV2,
} from "@/features/auth/access-types";

interface BrandSwitcherProps {
  access: CurrentAccessV2;
  id: string;
  compact?: boolean;
}

export function BrandSwitcher({ access, id, compact = false }: BrandSwitcherProps) {
  const pathname = usePathname() ?? "/dashboard";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const selectedBrandId = resolveActiveBrandId(
    access.brands,
    searchParams.get("brandId"),
  );
  function switchBrand(brandId: string) {
    if (!brandId || brandId === selectedBrandId) return;

    startTransition(() => {
      router.push(buildBrandSwitchHref(pathname, brandId, searchParams.toString()));
    });
  }

  return (
    <div
      className={compact ? "brand-picker brand-picker--compact" : "brand-picker"}
      aria-busy={isPending}
    >
      <label htmlFor={id}>Nhãn hàng</label>
      <div className="brand-picker__control">
        <select
          id={id}
          name="brandId"
          aria-label="Nhãn hàng"
          value={selectedBrandId ?? ""}
          disabled={isPending || access.brands.length === 0}
          onChange={(event) => switchBrand(event.currentTarget.value)}
        >
          {access.brands.length === 0 ? (
            <option value="">{access.isAdministrator ? "Toàn công ty" : "Chưa được cấp nhãn hàng"}</option>
          ) : null}
          {access.brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.code} · {brand.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
