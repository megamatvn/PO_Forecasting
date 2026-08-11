import type { PlanDiff } from "@/features/versions/domain/diff-plan";

export type ApprovalRequestStatus =
  | "pending_l1"
  | "pending_l2"
  | "approved"
  | "changes_requested";

export interface ApprovalRequestView {
  id: string;
  cycleCode: string;
  planVersionId: string;
  versionNumber: number;
  status: ApprovalRequestStatus;
  currentLevel: number;
  requiredLevels: 1 | 2;
  planAmount: string;
  currencyCode: string;
  routingReason: "fixed" | "under_threshold" | "threshold_met" | "exception";
  exceptionFlags: Record<string, boolean>;
  submittedAt: string;
  submittedBy: string;
  criticalCount: number;
  shortageImpact: number;
  amountChange: number;
  diffs: PlanDiff[];
  canDecide: boolean;
}

export interface ApprovalDecision {
  action: "approve" | "request_changes";
  comment: string;
}
