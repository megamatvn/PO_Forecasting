import Decimal from "decimal.js";

export type ProposalApprovalMode = "forced_two_level" | "threshold";
export type ProposalRoute = "manager_only" | "manager_then_executive";
export type ProposalRouteReason = "forced_two_level" | "under_threshold" | "threshold_met" | "over_plan";

export interface ProposalRoutingInput {
  mode: ProposalApprovalMode;
  thresholdAmount: string | null;
  referenceAmount: string;
  anyLineOverPlan: boolean;
}

export interface ProposalRoutingResult { route: ProposalRoute; reason: ProposalRouteReason; requiresExecutive: boolean; referenceAmount: string; }

export function deriveProposalRoute(input: ProposalRoutingInput): ProposalRoutingResult {
  let referenceAmount: Decimal;
  try { referenceAmount = new Decimal(input.referenceAmount); } catch { throw new Error("Giá trị tham chiếu không hợp lệ."); }
  if (!referenceAmount.isFinite() || referenceAmount.isNegative()) throw new Error("Giá trị tham chiếu không hợp lệ.");
  if (input.anyLineOverPlan) return { route: "manager_then_executive", reason: "over_plan", requiresExecutive: true, referenceAmount: referenceAmount.toFixed(2) };
  if (input.mode === "forced_two_level") return { route: "manager_then_executive", reason: "forced_two_level", requiresExecutive: true, referenceAmount: referenceAmount.toFixed(2) };
  if (!input.thresholdAmount) throw new Error("Chính sách theo hạn mức phải có giá trị hạn mức.");
  let threshold: Decimal;
  try { threshold = new Decimal(input.thresholdAmount); } catch { throw new Error("Giá trị hạn mức không hợp lệ."); }
  if (!threshold.isFinite() || threshold.isNegative()) throw new Error("Giá trị hạn mức không hợp lệ.");
  if (referenceAmount.lessThan(threshold)) return { route: "manager_only", reason: "under_threshold", requiresExecutive: false, referenceAmount: referenceAmount.toFixed(2) };
  return { route: "manager_then_executive", reason: "threshold_met", requiresExecutive: true, referenceAmount: referenceAmount.toFixed(2) };
}
