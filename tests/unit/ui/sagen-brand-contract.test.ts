import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function source(file: string) {
  return readFile(path.join(root, file), "utf8");
}

describe("Sagen brand and interaction contract", () => {
  it("uses the official Sagen assets and emerald visual tokens", async () => {
    await expect(
      access(path.join(root, "public/brand/sagen-symbol.png")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(root, "public/brand/sagen-wordmark.png")),
    ).resolves.toBeUndefined();

    const [globals, sidebar] = await Promise.all([
      source("src/app/globals.css"),
      source("src/components/ui/app-sidebar.tsx"),
    ]);

    expect(globals).toContain("--brand-primary: #0f9f6e");
    expect(globals).toContain("--brand-accent: #8dc63f");
    expect(globals).not.toContain("--gold:");
    expect(sidebar).toContain('/brand/sagen-wordmark.png');
    expect(sidebar).not.toContain('className="brand-monogram"');
  });

  it("renders context and metrics as distinct layers instead of fused square boxes", async () => {
    const [planning, dashboard] = await Promise.all([
      source("src/app/styles/planning.css"),
      source("src/app/styles/dashboard.css"),
    ]);

    expect(planning).toMatch(
      /\.plan-context-bar dl\s*\{[\s\S]*?border-radius:\s*999px/,
    );
    expect(planning).not.toMatch(
      /\.plan-context-bar dl > div\s*\{[^}]*\bborder:\s*1px solid/,
    );
    expect(dashboard).toMatch(
      /\.metric-strip dl\s*\{[\s\S]*?gap:\s*0\.75rem/,
    );
    expect(dashboard).toMatch(
      /\.metric-strip dl > div\s*\{[\s\S]*?border-radius:\s*12px/,
    );
  });

  it("uses Vietnamese operator-facing terminology", async () => {
    const content = (
      await Promise.all([
        source("src/components/navigation/navigation-model.ts"),
        source("src/components/ui/app-sidebar.tsx"),
        source("src/features/planning/components/planning-product-list.tsx"),
        source("src/features/planning/components/planning-product-editor.tsx"),
        source("src/features/planning/components/stock-alert.tsx"),
        source("src/features/reports/components/po-timeline.tsx"),
      ])
    ).join("\n");

    expect(content).toContain("Kế hoạch mua hàng");
    expect(content).toContain("Đợt mua & ngày hàng về");
    expect(content).toContain("Khẩn cấp");
    expect(content).toContain("Cần chú ý");
    expect(content).toContain("Ổn định");
    expect(content).toContain("Hàng tặng (FOC)");
    expect(content).toContain("Đơn giá xuất xưởng");
    expect(content).not.toMatch(/>Critical</);
    expect(content).not.toMatch(/>Ex Price</);
    expect(content).not.toContain("PO Forecasting");
  });
});
