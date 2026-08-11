import type {
  NormalizedImportRow,
  RawForecastRow,
} from "@/features/imports/domain/import-types";
import { canonicalizeSku } from "@/lib/domain/sku";

export function normalizeRows(
  rows: readonly RawForecastRow[],
  aliases: ReadonlyMap<string, string>,
): NormalizedImportRow[] {
  return rows.map((row) => ({
    ...row,
    rawSku: row.rawSku.trim().toUpperCase(),
    canonicalSku: canonicalizeSku(row.rawSku, aliases),
  }));
}
