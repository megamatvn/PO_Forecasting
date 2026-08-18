import { expect, test } from "@playwright/test";
import { login, requireLocalSupabase, resetCycle } from "./support";

test("Dashboard giải thích tình trạng và mở đúng sản phẩm cần xử lý", async ({ page }) => {
  requireLocalSupabase();
  await page.setViewportSize({ width: 1366, height: 768 });

  await login(page, "admin@local.test");
  const cycle = await resetCycle(page);
  await login(page, "planner@local.test");
  await page.goto(`/dashboard?brandId=10000000-0000-0000-0000-000000000001&cycleId=${cycle.cycleId}`);

  const requiredInFirstViewport = [
    page.getByLabel("Bối cảnh kế hoạch"),
    page.getByRole("region", { name: "Tóm tắt điều hành" }),
    page.getByRole("region", { name: "Sức khỏe kế hoạch" }),
    page.getByRole("link", { name: "Mở kế hoạch mua hàng" }),
  ];

  for (const locator of requiredInFirstViewport) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, "Expected dashboard decision control to have a layout box").not.toBeNull();
    expect((box?.y ?? Number.POSITIVE_INFINITY) + (box?.height ?? 0)).toBeLessThanOrEqual(768);
  }

  await expect(page.getByTestId("dashboard-health-card")).toHaveCount(3);
  await page.getByRole("link", { name: "Xử lý" }).first().click();
  await expect(page).toHaveURL(/\/planning\/[^?]+\?.*lineId=/);
  await expect(page.locator(".planning-workspace__detail")).toHaveAttribute(
    "data-planning-view",
    "detail",
  );
  await expect(page.locator('tr[aria-current="true"]')).toHaveCount(1);
});
