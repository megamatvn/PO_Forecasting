import { createHash } from "node:crypto";
import type { ImportPreview } from "@/features/imports/domain/import-types";
import { normalizeRows } from "@/features/imports/server/normalize-rows";
import {
  assertImportFile,
  readForecastWorkbook,
} from "@/features/imports/server/read-workbook";
import { validateImport } from "@/features/imports/server/validate-import";

interface BuildImportPreviewInput {
  buffer: Buffer | Uint8Array;
  fileName: string;
  aliases: ReadonlyMap<string, string>;
  knownCanonicalSkus: ReadonlySet<string>;
}

export async function buildImportPreview({
  buffer,
  fileName,
  aliases,
  knownCanonicalSkus,
}: BuildImportPreviewInput): Promise<ImportPreview> {
  assertImportFile(fileName, buffer.byteLength);

  const rawRows = await readForecastWorkbook(buffer);
  const rows = normalizeRows(rawRows, aliases);
  const validation = validateImport(rows, knownCanonicalSkus);

  return {
    checksum: createHash("sha256").update(buffer).digest("hex"),
    rows,
    ...validation,
  };
}
