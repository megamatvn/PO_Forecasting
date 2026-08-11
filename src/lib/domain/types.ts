export type PlanStatus =
  | "draft"
  | "submitted"
  | "review_l1"
  | "review_l2"
  | "approved"
  | "changes_requested"
  | "superseded";

export type ApprovalMode = "fixed_two_level" | "threshold";

export interface MoneyInput {
  qty: number;
  exPrice: string;
}

export interface MonthlyStockInput {
  openingStock: number;
  demand: number;
  qty: number;
  focQty: number;
  isCancelled: boolean;
}

export interface ApprovalRouteInput {
  mode: ApprovalMode;
  amount: string;
  threshold: string | null;
  hasEscalationException: boolean;
}

export interface ApprovalRoute {
  levels: 1 | 2;
  reason: "fixed" | "under_threshold" | "threshold_met" | "exception";
}
