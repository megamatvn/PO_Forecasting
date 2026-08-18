import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("responsive planning breakpoint boundary", () => {
  it("keeps the master/detail breakpoint in the responsive module", async () => {
    const [globals, responsive] = await Promise.all([
      readFile(path.join(root, "src/app/globals.css"), "utf8"),
      readFile(path.join(root, "src/app/styles/responsive.css"), "utf8"),
    ]);

    expect(globals).not.toMatch(/\.planning-workspace__detail\s*\{/);
    expect(responsive).toMatch(
      /@media\s*\(max-width:\s*1100px\)[\s\S]*\.planning-workspace__detail\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(responsive).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*?\.planning-header\s*\{[\s\S]*?flex-direction:\s*column/,
    );
    expect(responsive).toMatch(
      /\.planning-workspace > \*\s*\{[\s\S]*?min-width:\s*0/,
    );
    expect(globals).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*?\.app-frame\s*\{[\s\S]*?display:\s*block[\s\S]*?\.app-sidebar\s*\{[\s\S]*?display:\s*none/,
    );
  });

  it("caps application headings and dialogs at compact operational sizes", async () => {
    const [dashboard, administration, responsive] = await Promise.all([
      readFile(path.join(root, "src/app/styles/dashboard.css"), "utf8"),
      readFile(path.join(root, "src/app/styles/administration.css"), "utf8"),
      readFile(path.join(root, "src/app/styles/responsive.css"), "utf8"),
    ]);

    expect(dashboard).toMatch(
      /\.page-header h1\s*\{[\s\S]*?font-size:\s*clamp\(2rem,\s*3vw,\s*2\.5rem\)/,
    );
    expect(administration).toMatch(
      /\.approval-review__header h1\s*\{[\s\S]*?font-size:\s*clamp\([^;]+2\.5rem\)/,
    );
    expect(administration).toMatch(
      /\.approval-dialog__panel h2\s*\{[\s\S]*?font-size:\s*1\.375rem/,
    );
    expect(responsive).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*?\.page-header h1\s*\{[\s\S]*?font-size:\s*clamp\(1\.625rem,\s*8vw,\s*2rem\)/,
    );
  });
});
