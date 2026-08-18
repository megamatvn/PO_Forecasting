import { expect, test, type Locator, type Page } from "@playwright/test";
import { login, requireLocalSupabase, resetCycle } from "./support";

const targetViewports = [
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function expectMinimumTargetSize(
  locator: Locator,
  minimum = 44,
) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(minimum);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(minimum);
}

test.describe("navigation and responsive acceptance", () => {
  test("keeps dashboard decisions and controls inside every target viewport", async ({ page }) => {
    requireLocalSupabase();
    await login(page, "admin@local.test");
    const cycle = await resetCycle(page);
    await login(page, "planner@local.test");

    for (const viewport of targetViewports) {
      await page.setViewportSize(viewport);
      await page.goto(
        `/dashboard?brandId=10000000-0000-0000-0000-000000000001&cycleId=${cycle.cycleId}`,
      );
      await expect(page.getByLabel("Bối cảnh kế hoạch")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);

      if (viewport.width < 900) {
        await expectMinimumTargetSize(page.getByRole("button", { name: "Mở menu điều hướng" }));
      }
      await expectMinimumTargetSize(page.getByRole("link", { name: "Xử lý sản phẩm thiếu hàng" }));
    }
  });

  test("completes the mobile list-detail-back flow and keeps admin actions reachable", async ({ page }) => {
    requireLocalSupabase();
    await login(page, "admin@local.test");
    const cycle = await resetCycle(page);
    await login(page, "planner@local.test");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/planning/${cycle.cycleId}?step=products`);

    await expect(page.getByRole("row", { name: /ET-015150/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("row", { name: /ET-015150/i }).click();
    await expect(page.getByRole("heading", { name: "ET-015150" })).toBeVisible();
    await expectMinimumTargetSize(page.getByRole("button", { name: "Quay lại danh sách" }));
    await page.getByRole("button", { name: "Quay lại danh sách" }).click();
    await expect(page.getByRole("row", { name: /ET-015150/i })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await login(page, "admin@local.test");
    await page.goto("/admin/approval-policies");
    await expectNoHorizontalOverflow(page);
    await expect(page.locator(".policy-summary__actions")).toHaveCSS("position", "sticky");
    await expectMinimumTargetSize(page.getByRole("button", { name: "Lưu chính sách" }));
  });

  test("does not expose the reset endpoint outside local test mode", async ({ page }) => {
    test.skip(
      process.env.E2E_DATABASE_MODE === "local",
      "The reset endpoint is intentionally enabled only for isolated local E2E mode.",
    );
    const response = await page.request.post("/api/e2e/reset", {
      data: { runId: crypto.randomUUID() },
    });
    expect(response.status()).toBe(404);
  });
});
