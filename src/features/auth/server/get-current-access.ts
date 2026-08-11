import type {
  BrandAccess,
  CurrentAccess,
} from "@/features/auth/access-types";
import type { AppRole } from "@/features/auth/permissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RoleRow {
  role: AppRole;
}

interface BrandAccessRow {
  brand_id: string;
}

interface ProfileRow {
  display_name: string;
}

export async function getCurrentAccess(): Promise<CurrentAccess | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [profileResult, rolesResult, accessResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase
      .from("user_brand_access")
      .select("brand_id")
      .eq("user_id", user.id),
  ]);

  const brandIds = ((accessResult.data ?? []) as BrandAccessRow[]).map(
    (row) => row.brand_id,
  );
  const brandsResult = brandIds.length
    ? await supabase
        .from("brands")
        .select("id, code, name")
        .in("id", brandIds)
        .eq("is_active", true)
        .order("code")
    : { data: [], error: null };

  const brands = (brandsResult.data ?? []) as BrandAccess[];
  const profile = profileResult.data as ProfileRow | null;

  return {
    displayName:
      profile?.display_name || user.email?.split("@")[0] || "Người dùng Sagen",
    roles: ((rolesResult.data ?? []) as RoleRow[]).map((row) => row.role),
    brands,
    activeBrandId: brands[0]?.id ?? null,
  };
}
