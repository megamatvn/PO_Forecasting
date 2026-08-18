import { describe, expect, it } from "vitest";
import type { NormalizedImportRow } from "@/features/imports/domain/import-types";
import { validateImport } from "@/features/imports/server/validate-import";

const baseRow: NormalizedImportRow = {
  rowNumber: 7,
  rawSku: "ET-015027",
  canonicalSku: "ET-015025",
  productName: "Đặc trị xanh",
  exPrice: "4.25",
  currentStock: 100,
  purchaseWaves: [],
};

describe("validateImport", () => {
  it("reports an imported Amount mismatch as a warning and recalculates from Qty", () => {
    const result = validateImport(
      [
        {
          ...baseRow,
          purchaseWaves: [
            {
              waveNumber: 6,
              qty: 100,
              focQty: 0,
              importedAmount: "0.00",
            },
          ],
        },
      ],
      new Set(["ET-015025"]),
    );

    expect(result.canCommit).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "formula_mismatch",
        field: "purchaseWaves.6.importedAmount",
      }),
    );
  });

  it("blocks a batch containing an unknown SKU", () => {
    const result = validateImport(
      [{ ...baseRow, rawSku: "ET-UNKNOWN", canonicalSku: "ET-UNKNOWN" }],
      new Set(["ET-015025"]),
    );

    expect(result.canCommit).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: "error", code: "unknown_sku" }),
    );
  });

  it("blocks duplicate rows after canonical SKU normalization", () => {
    const result = validateImport(
      [baseRow, { ...baseRow, rowNumber: 8, rawSku: "ET-015025" }],
      new Set(["ET-015025"]),
    );

    expect(result.canCommit).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: "error", code: "duplicate_row" }),
    );
  });

  it("blocks malformed monthly demand and receipt values", () => {
    const result = validateImport(
      [
        {
          ...baseRow,
          monthlyDemand: [{ demandMonth: "2026-01-01", demandQty: 0, invalid: true }],
          purchaseReceipts: [{
            sourceReference: "NK-1",
            supplierCode: "COOPER",
            supplierName: "COOPER France",
            orderDate: null,
            etaDate: null,
            qty: 0,
            focQty: 0,
            status: "confirmed",
            invalid: true,
          }],
        },
      ],
      new Set(["ET-015025"]),
    );

    expect(result.canCommit).toBe(false);
    expect(result.issues.filter((item) => item.code === "invalid_number")).toHaveLength(2);
  });

  it("keeps rounded fractional demand committable but visible as a warning", () => {
    const result = validateImport(
      [{
        ...baseRow,
        monthlyDemand: [{
          demandMonth: "2026-01-01",
          demandQty: 228,
          roundedFrom: 227.5,
        }],
      }],
      new Set(["ET-015025"]),
    );

    expect(result.canCommit).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "fractional_quantity_rounded",
      field: "monthlyDemand.2026-01-01.demandQty",
    }));
  });
});
