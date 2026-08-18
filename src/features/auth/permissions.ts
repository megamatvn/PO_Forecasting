import type {
  BrandCapabilityAccess,
  CurrentAccessV2,
} from "@/features/auth/access-types";
import type { Capability } from "@/features/organization/contracts";

export type AppRole =
  | "administrator"
  | "planner"
  | "approver_l1"
  | "approver_l2"
  | "viewer";

export type AppAction =
  | "view"
  | "edit_plan"
  | "approve_l1"
  | "approve_l2"
  | "administer";

const actionRoles: Record<AppAction, readonly AppRole[]> = {
  view: ["planner", "approver_l1", "approver_l2", "viewer"],
  edit_plan: ["planner"],
  approve_l1: ["approver_l1"],
  approve_l2: ["approver_l2"],
  administer: [],
};

export function canPerform(
  roleSet: ReadonlySet<AppRole>,
  action: AppAction,
): boolean {
  if (roleSet.has("administrator")) {
    return true;
  }

  return actionRoles[action].some((role) => roleSet.has(role));
}

/**
 * Check a V2 organization capability assigned to the current user.
 *
 * Administrator is intentionally not folded into this predicate: it is an
 * independent system capability and is exposed separately by CurrentAccessV2.
 * Callers that need administrator access should check `isAdministrator` (or
 * include `administer_system` in the user's capability list).
 */
export function canUseCapability(
  assignedCapabilities: readonly Capability[],
  capability: Capability,
): boolean {
  return assignedCapabilities.includes(capability);
}

export function canUseAnyBrandCapability(
  brands: readonly BrandCapabilityAccess[],
  capability: Capability,
): boolean {
  return brands.some((brand) => canUseCapability(brand.capabilities, capability));
}

export function canUseV2Capability(
  access: Pick<CurrentAccessV2, "capabilities" | "brands">,
  capability: Capability,
): boolean {
  return (
    canUseCapability(access.capabilities, capability) ||
    canUseAnyBrandCapability(access.brands, capability)
  );
}

/**
 * Check a V2 capability scoped to one brand. Unknown brands are denied.
 * The same predicate handles direct and inherited brand permissions because
 * both are normalized into `CurrentAccessV2.brands` by the server DAL.
 */
export function canUseBrandCapability(
  brands: readonly BrandCapabilityAccess[],
  brandId: string,
  capability: Capability,
): boolean {
  const brand = brands.find((candidate) => candidate.id === brandId);
  return brand ? canUseCapability(brand.capabilities, capability) : false;
}
