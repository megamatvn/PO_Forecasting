import type { PlanStatus } from "@/lib/domain/types";

export type PurchaseBatchStatus =
  | "planned"
  | "submitted"
  | "confirmed"
  | "received"
  | "cancelled";

export interface PlanVersionRecord {
  id: string;
  planningCycleId: string;
  versionNumber: number;
  parentVersionId: string | null;
  sourceSnapshotId: string | null;
  status: PlanStatus;
  lockVersion: number;
}

export interface PurchaseBatchRecord {
  id: string;
  planVersionId: string;
  batchNumber: number;
  name: string;
  orderDate: string;
  etaDate: string;
  status: PurchaseBatchStatus;
  currencyCode: string;
}

export interface PurchaseLineInput {
  purchaseBatchId: string;
  productId: string;
  qty: number;
  focQty: number;
  exPrice: string;
}
