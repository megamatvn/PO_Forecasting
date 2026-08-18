import type { PlanStatus } from "@/lib/domain/types";

export type PlanningSeverity = "healthy" | "warning" | "critical";

export interface PlanningBrandView {
  code: string;
}

export interface PlanningCycleView {
  id: string;
  code: string;
  name: string;
  planningYear: number;
  currencyCode: string;
  targetPurchaseAmount: string;
}
export interface PlanningVersionView {
  id: string;
  versionNumber: number;
  status: PlanStatus;
  lockVersion: number;
  updatedAt: string;
}

export interface PlanningRowView {
  planLineId: string;
  purchaseLineId?: string | null;
  productId: string;
  sku: string;
  productName: string;
  openingStock: number;
  targetStock: number;
  annualDemand: number;
  qty: number;
  focQty: number;
  exPrice: string;
  amount: string;
  projectedStock: number;
  recommendedQty: number;
  severity: PlanningSeverity;
}

export interface PlanningWorkspaceView {
  brand: PlanningBrandView;
  cycle: PlanningCycleView;
  version: PlanningVersionView;
  canEdit: boolean;
  rows: PlanningRowView[];
}
