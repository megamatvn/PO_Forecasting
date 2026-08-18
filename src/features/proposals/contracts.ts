import { z } from "zod";
import { monthSchema } from "@/features/annual-plans/contracts";

export const proposalStatuses = [
  "draft", "pending_manager", "pending_executive", "changes_requested", "approved",
  "rejected", "withdrawn", "cancellation_pending_manager",
  "cancellation_pending_executive", "cancelled",
] as const;
export type ProposalStatus = (typeof proposalStatuses)[number];

export const proposalInputSchema = z.object({
  brandId: z.string().uuid(),
  planningYear: z.number().int(),
  neededMonth: monthSchema,
  reason: z.string().trim().min(10).max(1000),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    requestedQty: z.number().int().positive(),
  })).min(1),
}).superRefine((value, ctx) => {
  if (value.planningYear < new Date().getFullYear()) {
    ctx.addIssue({
      code: "custom",
      path: ["planningYear"],
      message: "Năm kế hoạch không được ở trong quá khứ.",
    });
  }
});

export const proposalDraftSchema = z.object({
  brandId: z.string().uuid(),
  planningYear: z.number().int(),
  neededMonth: monthSchema,
  reason: z.string().trim().min(10).max(1000),
  idempotencyKey: z.string().uuid(),
}).superRefine((value, ctx) => {
  if (value.planningYear < new Date().getFullYear()) {
    ctx.addIssue({ code: "custom", path: ["planningYear"], message: "Năm kế hoạch không được ở trong quá khứ." });
  }
});
export const proposalSaveSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
  lines: proposalInputSchema.shape.lines,
});
export const proposalSubmitSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});
export const proposalWaveAssignmentSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
  waveId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});
export const proposalDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
  comment: z.string().trim().max(1000).optional().default(""),
  idempotencyKey: z.string().uuid(),
});
