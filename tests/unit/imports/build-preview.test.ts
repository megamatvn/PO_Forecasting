import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createForecastWorkbookFixture } from "../../fixtures/forecast-workbook";
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
    expect(preview.sourceSheetName).toBe("Forecast 5M");
    expect(preview.rows.map((row) => row.canonicalSku)).toEqual([
      "ET-015025",
      "ET-015150",
    ]);
    expect(preview.canCommit).toBe(true);
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ code: "formula_mismatch", severity: "warning" }),
    );
  });

  it("keeps the selected source sheet in the preview while canonicalizing the green-treatment aliases", async () => {
    const preview = await buildImportPreview({
      buffer: await createForecastWorkbookFixture({
        forecastSheetName: "Kế hoạch ETX 2026",
        additionalForecastSheetNames: ["Kế hoạch ETX 2027"],
      }),
      fileName: "etx-plan.xlsx",
      sourceSheetName: "Kế hoạch ETX 2027",
      aliases: new Map([
        ["ET-015025", "ET-015025"],
        ["ET-015026", "ET-015025"],
        ["ET-015027", "ET-015025"],
        ["ET-015150", "ET-015150"],
      ]),
      knownCanonicalSkus: new Set(["ET-015025", "ET-015150"]),
    });

    expect(preview.sourceSheetName).toBe("Kế hoạch ETX 2027");
    expect(preview.rows.find((row) => row.rawSku === "ET-015027")?.canonicalSku).toBe(
      "ET-015025",
    );
  });
});
