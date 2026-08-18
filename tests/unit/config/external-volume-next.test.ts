import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Next.js scripts on the external ExFAT workspace", () => {
  it("uses webpack so AppleDouble cache files cannot corrupt Turbopack persistence", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts.dev).toBe("next dev --webpack");
    expect(packageJson.scripts.build).toBe("next build --webpack");
  });
});
