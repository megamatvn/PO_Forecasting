import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const productUiFiles = [
  "src/components/ui/app-sidebar.tsx",
  "src/features/planning/components/planning-header.tsx",
  "src/app/(app)/planning/page.tsx",
  "src/app/(app)/imports/page.tsx",
  "src/features/imports/components/import-dropzone.tsx",
] as const;

const productUiSource = productUiFiles
  .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
  .join("\n");

describe("product UI copy", () => {
  it("does not present Forecast 5M as a product feature", () => {
    expect(productUiSource).not.toMatch(/Forecast 5M/);
  });
});
