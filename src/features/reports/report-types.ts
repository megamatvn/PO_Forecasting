import type { PlanningWorkspaceView } from "@/features/planning/planning-types";
import type { PurchaseBatchStatus } from "@/features/planning/contracts";

export interface DashboardKpiView {
  targetAmount: number;
  committedAmount: number;
  gapAmount: number;
  criticalCount: number;
  poCount: number;
}

export interface PoTimelineItem {
  id: string;
  batchNumber: number;
  name: string;
  orderDate: string;
  etaDate: string;
  status: PurchaseBatchStatus;
  amount: number;
  lineCount: number;
}

export interface DashboardView {
  plan: PlanningWorkspaceView;
  kpis: DashboardKpiView;
  batches: PoTimelineItem[];
}
