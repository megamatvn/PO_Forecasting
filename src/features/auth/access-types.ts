import { z } from "zod";
import type { AppRole } from "@/features/auth/permissions";
import {
  capabilities,
  orgTiers,
  type Capability,
  type OrgTier,
} from "@/features/organization/contracts";

// PostgreSQL accepts any syntactically valid UUID in its uuid type; it does
// not require an RFC version/variant nibble.  The local seed intentionally
// uses deterministic UUID-shaped fixtures, so the server boundary must not
// reject an otherwise valid database value merely because it is not RFC 4122
// versioned.  API commands still validate shape before passing values to SQL.
export const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

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

export interface BrandCapabilityAccess extends BrandAccess {
  capabilities: Capability[];
  sources: string[];
}

export interface CurrentAccessV2 {
  userId: string;
  displayName: string;
  tier: OrgTier;
  isAdministrator: boolean;
  capabilities: Capability[];
  supervisorId: string | null;
  executiveId: string | null;
  brands: BrandCapabilityAccess[];
}

export const currentAccessV2Schema = z.object({
  userId: postgresUuid,
  displayName: z.string().min(1),
  tier: z.enum(orgTiers),
  isAdministrator: z.boolean(),
  capabilities: z.array(z.enum(capabilities)),
  supervisorId: postgresUuid.nullable(),
  executiveId: postgresUuid.nullable(),
  brands: z.array(z.object({
    id: postgresUuid,
    code: z.string(),
    name: z.string(),
    capabilities: z.array(z.enum(capabilities)),
    sources: z.array(z.string()),
  })),
});

export function resolveActiveBrandId(
  brands: readonly BrandAccess[],
  requestedBrandId?: string | null,
): string | null {
  if (requestedBrandId && brands.some((brand) => brand.id === requestedBrandId)) {
    return requestedBrandId;
  }

  return brands[0]?.id ?? null;
}
