import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const administrationCss = readFileSync(
  resolve(process.cwd(), "src/app/styles/administration.css"),
  "utf8",
);
const globalCss = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

const administrationSelectors = [
  ".user-access-layout",
  ".approvals-layout",
  ".policy-editor",
  ".version-table",
] as const;

describe("administration CSS boundary", () => {
  it("keeps administration view selectors in the administration stylesheet", () => {
    for (const selector of administrationSelectors) {
      expect(administrationCss).toContain(selector);
      expect(globalCss).not.toContain(selector);
    }
  });
});
