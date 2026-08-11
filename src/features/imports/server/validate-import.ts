import Decimal from "decimal.js";
import type {
  ImportIssue,
  ImportValidationResult,
  NormalizedImportRow,
} from "@/features/imports/domain/import-types";
import { calculateAmount } from "@/lib/domain/money";

function issue(
  value: Omit<ImportIssue, "message"> & { message: string },
): ImportIssue {
  return value;
}

export function validateImport(
  rows: readonly NormalizedImportRow[],
  knownCanonicalSkus: ReadonlySet<string>,
): ImportValidationResult {
  const issues: ImportIssue[] = [];
  const firstRowByCanonicalSku = new Map<string, number>();

  for (const row of rows) {
    if (!row.rawSku) {
      issues.push(
        issue({
          severity: "error",
          rowNumber: row.rowNumber,
          field: "rawSku",
          code: "missing_sku",
          message: "Thiếu mã SKU.",
        }),
      );
      continue;
    }

    if (!knownCanonicalSkus.has(row.canonicalSku)) {
      issues.push(
        issue({
          severity: "error",
          rowNumber: row.rowNumber,
          field: "rawSku",
          code: "unknown_sku",
          message: `SKU ${row.rawSku} chưa được ánh xạ vào danh mục sản phẩm.`,
        }),
      );
    }

    const firstRow = firstRowByCanonicalSku.get(row.canonicalSku);
    if (firstRow !== undefined) {
      issues.push(
        issue({
          severity: "error",
          rowNumber: row.rowNumber,
          field: "canonicalSku",
          code: "duplicate_row",
          message: `SKU chuẩn ${row.canonicalSku} bị trùng với dòng ${firstRow}.`,
        }),
      );
    } else {
      firstRowByCanonicalSku.set(row.canonicalSku, row.rowNumber);
    }

    if (
      row.exPrice === null ||
      new Decimal(row.exPrice).isNegative() ||
      row.currentStock === null ||
      !Number.isFinite(row.currentStock)
    ) {
      issues.push(
        issue({
          severity: "error",
          rowNumber: row.rowNumber,
          field: row.exPrice === null ? "exPrice" : "currentStock",
          code: "invalid_number",
          message: "Ex Price hoặc tồn kho không phải là số hợp lệ.",
        }),
      );
      continue;
    }

    for (const wave of row.purchaseWaves) {
      if (wave.qty < 0 || wave.focQty < 0) {
        issues.push(
          issue({
            severity: "error",
            rowNumber: row.rowNumber,
            field: `purchaseWaves.${wave.waveNumber}.qty`,
            code: "invalid_number",
            message: `PO #${wave.waveNumber} có Qty hoặc FOC âm.`,
          }),
        );
        continue;
      }

      if (wave.importedAmount === null) {
        continue;
      }

      const calculatedAmount = calculateAmount({
        qty: wave.qty,
        exPrice: row.exPrice,
      });

      if (!new Decimal(wave.importedAmount).eq(calculatedAmount)) {
        issues.push(
          issue({
            severity: "warning",
            rowNumber: row.rowNumber,
            field: `purchaseWaves.${wave.waveNumber}.importedAmount`,
            code: "formula_mismatch",
            message:
              `PO #${wave.waveNumber}: Amount nguồn ${wave.importedAmount} ` +
              `được thay bằng Qty × Ex Price = ${calculatedAmount}.`,
          }),
        );
      }
    }
  }

  return {
    issues,
    canCommit: !issues.some((item) => item.severity === "error"),
  };
}
