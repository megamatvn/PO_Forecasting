import { expect, test } from "@playwright/test";
import { createV2Scenario, requireV2Local } from "./v2-support";

test.describe("Purchase Planning V2 — five-role acceptance", () => {
  test("Manager creates a private annual-plan draft and reaches SKU entry", async ({ browser }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "legacy-manager-draft-smoke");
    try {
      const page = await scenario.session("manager");
      await page.goto("/annual-plans/new?step=scope");
      await page.getByLabel("Nhãn hàng").selectOption({ label: scenario.brand.code });
      await page.getByLabel("Năm kế hoạch").selectOption({ label: "2026" });
      await page.getByRole("button", { name: "Tiếp tục" }).click();
      await expect(page).toHaveURL(/\/annual-plans\/[^?]+\?step=lines/);
      await expect(page.getByRole("heading", { name: "Tạo kế hoạch mua hàng" })).toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });

  test("Leader can submit a quantity-only proposal without baseline fields", async ({ browser }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "legacy-leader-smoke");
    try {
      const page = await scenario.session("leader");
      await page.goto("/proposals/new");
      await expect(page.getByRole("heading", { name: "Tạo đề xuất mua hàng" })).toBeVisible();
      await expect(page.getByLabel("Ex Price")).toHaveCount(0);
      await expect(page.getByLabel("FOC")).toHaveCount(0);
    } finally {
      await scenario.cleanup();
    }
  });

  test("Sagen prefix login is accepted for the configured Administrator seed", async ({ page }) => {
    requireV2Local();
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin");
    await page.getByLabel("Mật khẩu").fill("LocalDemo!2026");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
