import { z } from "zod";

export const annualPlanStatuses = [
  "draft_owner_only", "pending_executive", "approved", "changes_requested",
  "rejected", "withdrawn", "superseded",
] as const;
export type AnnualPlanStatus = (typeof annualPlanStatuses)[number];

export const MAX_ANNUAL_PLAN_YEAR = 2200;

export const monthSchema = z.string().regex(
  /^(?:[1-9]\d{3})-(0[1-9]|1[0-2])$/,
  "Tháng phải có định dạng YYYY-MM.",
);

export const annualLineInputSchema = z.object({
  productId: z.string().uuid(),
  exPrice: z.string().regex(/^\d+(\.\d{1,6})?$/, "Giá phải là chuỗi thập phân hợp lệ."),
  paidQty: z.number().int().nonnegative(),
  expectedFoc: z.number().int().nonnegative(),
  openingStock: z.number().int().nonnegative(),
});
