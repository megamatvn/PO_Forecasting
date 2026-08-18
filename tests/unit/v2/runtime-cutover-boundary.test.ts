import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeFiles = [
  "src/app/(app)/layout.tsx",
  "src/components/navigation/navigation-model.ts",
  "src/components/navigation/navigation-link.tsx",
  "src/components/navigation/brand-switcher.tsx",
  "src/components/navigation/mobile-navigation.tsx",
  "src/components/ui/app-sidebar.tsx",
];

describe("V2 authenticated shell boundary", () => {
  it("does not reintroduce legacy access or destinations", () => {
    for (const file of runtimeFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\/planning|\/versions|getCurrentAccess\(|user_roles|user_brand_access/);
    }
  });

  it("uses the V2 organization context in the authenticated layout", () => {
    const source = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(source).toContain("getOrganizationContext");
    expect(source).toContain("CurrentAccessV2");
  });
});
