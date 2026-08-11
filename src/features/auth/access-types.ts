import type { AppRole } from "@/features/auth/permissions";

export interface BrandAccess {
  id: string;
  code: string;
  name: string;
}

export interface CurrentAccess {
  displayName: string;
  roles: AppRole[];
  brands: BrandAccess[];
  activeBrandId: string | null;
}
