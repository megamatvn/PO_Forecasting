import { expect, test } from "@playwright/test";
import { login, requireLocalSupabase } from "./support";

test("dashboard V2 hiển thị việc cần xử lý và tiến độ PO", async ({ page }) => {
  requireLocalSupabase();
  await login(page, "admin@local.test");
  await page.goto("/dashboard");

  await expect(page.getByRole("region", { name: "Việc cần xử lý" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Sức khỏe kế hoạch" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tiến độ đợt mua" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ngoại lệ cần lưu ý" })).toBeVisible();
  await expect(page.getByText(/Forecast 5M|Import dữ liệu/)).toHaveCount(0);
});
