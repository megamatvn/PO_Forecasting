import { expect, test, type Page } from "@playwright/test";
import { login, requireLocalSupabase, resetCycle } from "./support";

const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ))
    .toBe(true);
}

test.describe("compact operations responsive acceptance", () => {
  test("keeps planning compact and usable at all target viewports", async ({ page }) => {
    requireLocalSupabase();
    await login(page, "admin@local.test");
    const cycle = await resetCycle(page);
    await login(page, "planner@local.test");

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/planning/${cycle.cycleId}?step=products`);

      await expectNoHorizontalOverflow(page);
      const h1Size = await page
        .getByRole("heading", { level: 1 })
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      expect(h1Size).toBeLessThanOrEqual(viewport.width <= 640 ? 32 : 40);

      const backButton = page.getByRole("button", { name: "Quay lại danh sách" });
      if (viewport.width > 560) {
        await expect(backButton).toBeHidden();
      } else {
        await page.getByRole("row", { name: /ET-015150/i }).click();
        await expect(backButton).toBeVisible();
      }
    }
  });

  test("reveals full product names to keyboard users", async ({ page }) => {
    requireLocalSupabase();
    await login(page, "admin@local.test");
    const cycle = await resetCycle(page);
    await login(page, "planner@local.test");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/planning/${cycle.cycleId}?step=products`);

    const productName = page.locator(".planning-product-list__name .truncated-text").first();
    await productName.focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tooltip")).toBeHidden();
  });
});
