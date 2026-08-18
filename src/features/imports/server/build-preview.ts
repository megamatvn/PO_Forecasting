import { createHash } from "node:crypto";
import type {
  BuildImportPreviewInput,
  ImportPreview,
} from "@/features/imports/domain/import-types";
import { normalizeRows } from "@/features/imports/server/normalize-rows";
import {
  assertImportFile,
  readForecastWorkbook,
} from "@/features/imports/server/read-workbook";
import { validateImport } from "@/features/imports/server/validate-import";

export async function buildImportPreview({
  buffer,
  fileName,
  sourceSheetName,
  aliases,
  knownCanonicalSkus,
}: BuildImportPreviewInput): Promise<ImportPreview> {
  assertImportFile(fileName, buffer.byteLength);

  const workbook = await readForecastWorkbook(buffer, sourceSheetName);
  const rows = normalizeRows(workbook.rows, aliases);
  const validation = validateImport(rows, knownCanonicalSkus);
  const planningYear = rows
    .flatMap((row) => row.monthlyDemand ?? [])
    .map((demand) => Number(demand.demandMonth.slice(0, 4)))
    .find((year) => Number.isInteger(year) && year >= 2000 && year <= 2100);

  return {
    checksum: createHash("sha256").update(buffer).digest("hex"),
    sourceSheetName: workbook.sourceSheetName,
    ...(planningYear ? { planningYear } : {}),
    rows,
    ...validation,
  };
}
