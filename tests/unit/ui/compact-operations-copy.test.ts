import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeFiles = [
  "src/app/(app)/planning/page.tsx",
  "src/app/(app)/annual-plans/page.tsx",
  "src/app/(app)/versions/page.tsx",
  "src/app/(app)/versions/[versionId]/page.tsx",
  "src/app/(app)/approvals/page.tsx",
  "src/app/(app)/admin/approval-policies/page.tsx",
  "src/app/(app)/admin/users/page.tsx",
] as const;

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("compact operations route copy", () => {
  it("uses the shared PageHeader on functional routes", () => {
    for (const file of routeFiles) {
      const content = source(file);
      expect(content, file).toContain("<PageHeader");
      expect(content, file).not.toContain('className="page-heading"');
    }
  });

  it("keeps operator-facing copy in clear Vietnamese", () => {
    const content = routeFiles.map(source).join("\n");

    expect(content).not.toMatch(/Audit · Version control/i);
    expect(content).not.toMatch(/Administration · Access control/i);
    expect(content).not.toMatch(/Atomic · RLS protected/i);
    expect(content).not.toMatch(/Snapshot policy bất biến/i);
    expect(content).not.toMatch(/\bDraft\b/);
  });
});
