import Decimal from "decimal.js";
import type {
  ApprovalRoute,
  ApprovalRouteInput,
} from "@/lib/domain/types";

export function routeApproval(input: ApprovalRouteInput): ApprovalRoute {
  if (input.mode === "fixed_two_level") {
    return { levels: 2, reason: "fixed" };
  }

  if (input.threshold === null || new Decimal(input.threshold).isNegative()) {
    throw new Error("Approval threshold is required for threshold mode.");
  }

  if (input.hasEscalationException) {
    return { levels: 2, reason: "exception" };
  }

  if (new Decimal(input.amount).gte(input.threshold)) {
    return { levels: 2, reason: "threshold_met" };
  }

  return { levels: 1, reason: "under_threshold" };
}
