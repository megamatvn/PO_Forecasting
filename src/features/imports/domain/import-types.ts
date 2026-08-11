export interface RawPurchaseWave {
  waveNumber: number;
  qty: number;
  focQty: number;
  importedAmount: string | null;
}

export interface RawMonthlyDemand {
  demandMonth: string;
  demandQty: number;
  invalid?: boolean;
}

export interface RawPurchaseReceipt {
  sourceReference: string;
  supplierCode: string | null;
  supplierName: string | null;
  orderDate: string | null;
  etaDate: string | null;
  qty: number;
  focQty: number;
  status: "confirmed" | "received";
  invalid?: boolean;
}

export interface RawForecastRow {
  rowNumber: number;
  rawSku: string;
  productName: string;
  exPrice: string | null;
  currentStock: number | null;
  annualPlannedQty?: number;
  annualImportedAmount?: string | null;
  purchaseWaves: RawPurchaseWave[];
  monthlyDemand?: RawMonthlyDemand[];
  purchaseReceipts?: RawPurchaseReceipt[];
}

export interface NormalizedImportRow extends RawForecastRow {
  canonicalSku: string;
}

export type ImportIssueCode =
  | "missing_sku"
  | "unknown_sku"
  | "invalid_number"
  | "duplicate_row"
  | "formula_mismatch";

export interface ImportIssue {
  severity: "error" | "warning";
  rowNumber: number;
  field: string;
  code: ImportIssueCode;
  message: string;
}

export interface ImportValidationResult {
  issues: ImportIssue[];
  canCommit: boolean;
}

export interface ImportPreview extends ImportValidationResult {
  checksum: string;
  rows: NormalizedImportRow[];
}
