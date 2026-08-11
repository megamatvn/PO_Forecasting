import { expect, test } from "@playwright/test";
import { login, requireLocalSupabase, resetCycle } from "./support";

test("Viewer chỉ thấy nhãn hàng và chức năng được cấp qua RLS", async ({ page }) => {
  requireLocalSupabase();
  await login(page, "admin@local.test");
  await resetCycle(page);
  await login(page, "viewer@local.test");

  const brandSwitcher = page.getByLabel("Nhãn hàng", { exact: true });

  await expect(brandSwitcher).toHaveValue(
    "10000000-0000-0000-0000-000000000001",
  );
  await expect(brandSwitcher.getByRole("option", { name: "ETX · ETX" })).toHaveCount(1);
  await expect(brandSwitcher.getByRole("option", { name: /HID/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Forecast Planning" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Import dữ liệu" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Chính sách duyệt" })).toHaveCount(0);

  await page.goto("/dashboard?brandId=10000000-0000-0000-0000-000000000002");
  await expect(page.getByLabel("Nhãn hàng", { exact: true })).toHaveValue(
    "10000000-0000-0000-0000-000000000001",
  );
});
