import "server-only";

import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapBrandDto, mapProductDto, type BrandOptionDTO, type ProductOptionDTO } from "../contracts";

export async function loadBrandOptions(includeInactive = false): Promise<BrandOptionDTO[]> {
  const access = await getOrganizationContext();
  if (!access) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_brand_options_v2", { p_include_inactive: includeInactive });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).map((row) => mapBrandDto(row as Record<string, unknown>));
}

export async function loadProductOptions(brandId: string, includeInactive = false): Promise<ProductOptionDTO[]> {
  const access = await getOrganizationContext();
  if (!access || !access.brands.some((brand) => brand.id === brandId) && !access.isAdministrator) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_product_options_v2", { p_brand_id: brandId, p_include_inactive: includeInactive });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).map((row) => mapProductDto(row as Record<string, unknown>));
}
