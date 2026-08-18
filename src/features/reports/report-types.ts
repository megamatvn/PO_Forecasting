import type { PlanningWorkspaceView } from "@/features/planning/planning-types";
import type { PurchaseBatchStatus } from "@/features/planning/contracts";

export interface DashboardKpiView {
  targetAmount: number;
  committedAmount: number;
  gapAmount: number;
  criticalCount: number;
  actionableSkuCount: number;
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

export interface DashboardPriorityItem {
  planLineId: string;
  sku: string;
  productName: string;
  recommendedQty: number;
  severity: PlanningWorkspaceView["rows"][number]["severity"];
}

export interface DashboardBatchStatusCounts {
  planned: number;
  submitted: number;
  confirmed: number;
  received: number;
}

export interface DashboardInsightView {
  totalRecommendedQty: number;
  topPriorityRows: DashboardPriorityItem[];
  batchStatusCounts: DashboardBatchStatusCounts;
  nextEtaDate: string | null;
  budgetUtilization: number;
}

export interface DashboardView {
  plan: PlanningWorkspaceView;
  kpis: DashboardKpiView;
  batches: PoTimelineItem[];
  insights: DashboardInsightView;
}
