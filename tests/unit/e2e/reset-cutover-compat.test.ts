import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("E2E reset remains usable after legacy table cutover", () => {
  it("does not issue unconditional queries against tables removed by V2 cutover", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/e2e/reset/route.ts"),
      "utf8",
    );

    expect(route).toMatch(/deleteLegacyRelationIfPresent/);
    expect(route).not.toMatch(/delete from public\.user_brand_access/);
    expect(route).not.toMatch(/delete from public\.user_roles/);
  });
});
