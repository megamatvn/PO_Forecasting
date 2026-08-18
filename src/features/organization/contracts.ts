import { z } from "zod";

export const orgTiers = ["employee_viewer", "leader", "manager", "executive"] as const;
export const capabilities = [
  "create_annual_plan",
  "view_approved_plan",
  "create_purchase_proposal",
  "manage_master_data",
  "administer_system",
] as const;

export const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

export type OrgTier = (typeof orgTiers)[number];
export type Capability = (typeof capabilities)[number];

export const organizationAssignmentSchema = z.object({
  tier: z.enum(orgTiers),
  isActive: z.boolean(),
  supervisorId: postgresUuid.nullable(),
}).superRefine((value, ctx) => {
  if (value.isActive && ["leader", "manager"].includes(value.tier) && !value.supervisorId) {
    ctx.addIssue({
      code: "custom",
      path: ["supervisorId"],
      message: "Bắt buộc chọn người quản lý trực tiếp.",
    });
  }
});
