import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildImportPreview } from "@/features/imports/server/build-preview";

const fixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/forecast-import.synthetic.xlsx",
);

describe("buildImportPreview", () => {
  it("returns a deterministic checksum, canonical rows and non-blocking warnings", async () => {
    const buffer = await readFile(fixturePath);
    const preview = await buildImportPreview({
      buffer,
      fileName: "forecast-import.synthetic.xlsx",
      aliases: new Map([
        ["ET-015027", "ET-015025"],
        ["ET-015150", "ET-015150"],
      ]),
      knownCanonicalSkus: new Set(["ET-015025", "ET-015150"]),
    });

    expect(preview.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.rows.map((row) => row.canonicalSku)).toEqual([
      "ET-015025",
      "ET-015150",
    ]);
    expect(preview.canCommit).toBe(true);
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ code: "formula_mismatch", severity: "warning" }),
    );
  });
});
