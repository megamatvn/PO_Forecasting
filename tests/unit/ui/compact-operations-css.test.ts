import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("compact operations CSS contract", () => {
  it("limits app-shell headings and uses sans headings below page level", async () => {
    const [globals, dashboard, responsive] = await Promise.all([
      readFile(path.join(root, "src/app/globals.css"), "utf8"),
      readFile(path.join(root, "src/app/styles/dashboard.css"), "utf8"),
      readFile(path.join(root, "src/app/styles/responsive.css"), "utf8"),
    ]);

    expect(globals).not.toMatch(
      /h1,\s*h2,\s*h3\s*\{[\s\S]*?font-family:\s*var\(--serif\)/,
    );
    expect(globals).toMatch(/h1\s*\{[\s\S]*?font-family:\s*var\(--serif\)/);
    expect(globals).toMatch(/h2,\s*h3\s*\{[\s\S]*?font-family:\s*var\(--sans\)/);
    expect(globals).toMatch(
      /\.page-shell\s*\{[\s\S]*?padding:\s*clamp\(1\.5rem,\s*2\.5vw,\s*2\.5rem\)/,
    );
    expect(dashboard).toMatch(
      /\.page-header h1\s*\{[\s\S]*?font-size:\s*clamp\(2rem,\s*3vw,\s*2\.5rem\)/,
    );
    expect(dashboard).toMatch(
      /\.page-header__description\s*\{[\s\S]*?-webkit-line-clamp:\s*1/,
    );
    expect(responsive).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*?\.page-header h1\s*\{[\s\S]*?font-size:\s*clamp\(1\.625rem,\s*8vw,\s*2rem\)/,
    );
  });

  it("keeps the sidebar compact without a fixed action column", async () => {
    const [globals, shell] = await Promise.all([
      readFile(path.join(root, "src/app/globals.css"), "utf8"),
      readFile(path.join(root, "src/app/styles/app-shell.css"), "utf8"),
    ]);

    expect(globals).not.toMatch(
      /\.brand-picker__control\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+2\.75rem/,
    );
    expect(globals).not.toMatch(/\.nav-marker\s*\{/);
    expect(shell).toMatch(
      /\.app-frame\s*\{[\s\S]*?grid-template-columns:\s*16rem\s+minmax\(0,\s*1fr\)/,
    );
  });

  it("gives the planning SKU list more room without wrapping identifiers", async () => {
    const planning = await readFile(
      path.join(root, "src/app/styles/planning.css"),
      "utf8",
    );

    expect(planning).toMatch(
      /planning-workspace__detail[\s\S]*grid-template-columns:\s*minmax\([^;]+58fr[^;]+42fr/,
    );
    expect(planning).toMatch(
      /planning-product-list__sku[\s\S]*white-space:\s*nowrap/,
    );
    expect(planning).toMatch(
      /planning-product-list__name[\s\S]*text-overflow:\s*ellipsis/,
    );
    expect(planning).toMatch(
      /planning-product-editor__back\s*\{[\s\S]*?display:\s*none/,
    );
    expect(planning).toMatch(
      /@media\s*\(max-width:\s*560px\)[\s\S]*planning-product-editor__back[\s\S]*display:\s*inline-flex/,
    );
  });

  it("keeps dashboard metrics and PO rows compact", async () => {
    const [dashboard, globals] = await Promise.all([
      readFile(path.join(root, "src/app/styles/dashboard.css"), "utf8"),
      readFile(path.join(root, "src/app/globals.css"), "utf8"),
    ]);

    expect(dashboard).toMatch(
      /metric-strip dl > div\s*\{[\s\S]*?min-height:\s*5\.75rem/,
    );
    expect(dashboard).not.toMatch(/metric-strip dl > div[\s\S]*?min-height:\s*7\.5rem/);
    expect(dashboard).toMatch(
      /\.po-timeline\s*\{[\s\S]*?border-radius:\s*12px[\s\S]*?padding:\s*1rem\s+1\.25rem/,
    );
    expect(dashboard).toMatch(
      /\.po-timeline__list article\s*\{[\s\S]*?min-height:\s*4\.5rem/,
    );
    expect(globals).not.toMatch(/\.po-timeline\s*\{/);
  });

  it("keeps the approval policy accordion and confirmation panel compact", async () => {
    const administration = await readFile(
      path.join(root, "src/app/styles/administration.css"),
      "utf8",
    );

    expect(administration).toMatch(
      /\.policy-section__header h2\s*\{[\s\S]*?font-size:\s*1\.25rem/,
    );
    expect(administration).toMatch(
      /\.policy-summary h2\s*\{[\s\S]*?font-size:\s*1\.375rem/,
    );
    expect(administration).toMatch(
      /\.policy-summary__actions\s*\{[\s\S]*?min-height:\s*4rem/,
    );
    expect(administration).not.toMatch(/\.policy-editor > footer/);
  });

  it("uses a compact 32/68 user-access master-detail layout", async () => {
    const administration = await readFile(
      path.join(root, "src/app/styles/administration.css"),
      "utf8",
    );

    expect(administration).toMatch(
      /\.user-access-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(17rem,\s*32fr\)\s+minmax\(0,\s*68fr\)/,
    );
    expect(administration).toMatch(
      /\.user-access-options\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    );
    expect(administration).toMatch(
      /\.user-access-options label\s*\{[\s\S]*?min-height:\s*3rem[\s\S]*?border-radius:\s*6px/,
    );
  });
});
