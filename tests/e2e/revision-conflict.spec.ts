import { expect, test } from "@playwright/test";
import { login, requireLocalSupabase, resetCycle } from "./support";

test("hai phiên Planner thật tạo CAS conflict và giữ bản local", async ({ browser, page }) => {
  requireLocalSupabase();
  await login(page, "admin@local.test");
  const cycle = await resetCycle(page);

  const contextA = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const contextB = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await login(pageA, "planner@local.test");
    await login(pageB, "planner@local.test");
    await pageA.goto(`/planning/${cycle.cycleId}`);
    await pageB.goto(`/planning/${cycle.cycleId}`);
    await expect(pageA.getByRole("button", { name: "Tạo PO đề xuất 2.368" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Tạo PO đề xuất 2.368" })).toBeVisible();

    await pageA.getByRole("button", { name: "Tạo PO đề xuất 2.368" }).click();
    await expect(pageA.getByText("Đã lưu", { exact: true })).toBeVisible();
    await pageB.getByRole("button", { name: "Tạo PO đề xuất 2.368" }).click();
    await expect(pageB.getByRole("dialog", { name: "Xung đột phiên bản" })).toBeVisible();
    await expect(pageB.getByRole("spinbutton", { name: "Qty ET-015150" })).toHaveValue("2368");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
