import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("dashboard command center CSS contract", () => {
  it("separates every dashboard block and uses independent health cards", async () => {
    const dashboard = await readFile(
      path.join(root, "src/app/styles/dashboard.css"),
      "utf8",
    );

    expect(dashboard).toMatch(
      /\.dashboard-page\s*\{[\s\S]*?display:\s*grid[\s\S]*?gap:\s*1\.5rem/,
    );
    expect(dashboard).toMatch(
      /\.dashboard-health\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)[\s\S]*?gap:\s*1rem/,
    );
    expect(dashboard).toMatch(
      /\.dashboard-health-card\s*\{[\s\S]*?border-radius:\s*12px[\s\S]*?box-shadow:/,
    );
  });

  it("uses a 60/40 decision grid and collapses safely on smaller screens", async () => {
    const dashboard = await readFile(
      path.join(root, "src/app/styles/dashboard.css"),
      "utf8",
    );

    expect(dashboard).toMatch(
      /\.dashboard-decision-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*3fr\)\s+minmax\(18rem,\s*2fr\)[\s\S]*?gap:\s*1\.5rem/,
    );
    expect(dashboard).toMatch(
      /@media\s*\(max-width:\s*1024px\)[\s\S]*?\.dashboard-decision-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(dashboard).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*?\.dashboard-health\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it("keeps legacy dashboard and timeline rules out of globals", async () => {
    const globals = await readFile(
      path.join(root, "src/app/globals.css"),
      "utf8",
    );

    expect(globals).not.toMatch(/\.dashboard-critical|\.dashboard-kpi|\.dashboard-filters/);
    expect(globals).not.toMatch(/\.po-timeline\s*\{|\.po-status\s*\{/);
  });
});
