import { expect, test } from "@playwright/test";
import { login, requireLocalSupabase, resetCycle } from "./support";

test("quản trị áp dụng chính sách hạn mức qua API và Supabase", async ({ page }) => {
  requireLocalSupabase();
  await login(page, "admin@local.test");
  const cycle = await resetCycle(page);
  await page.goto("/admin/approval-policies");

  await page.getByLabel("ETX · ETX").check();
  await page.getByLabel("Tên chính sách").fill("E2E ETX dưới hạn mức");
  await page.getByRole("radio", { name: /^Duyệt theo hạn mức/ }).check();
  await page.getByLabel("Hạn mức chuyển 2 cấp").fill("50000");
  await page.getByLabel("Hiệu lực từ").fill(new Date().toISOString().slice(0, 10));
  const policyResponse = page.waitForResponse("**/api/admin/approval-policies");
  await page.getByRole("button", { name: "Lưu và áp dụng" }).click();
  expect((await policyResponse).status()).toBe(201);

  await login(page, "planner@local.test");
  await page.goto(`/planning/${cycle.cycleId}`);
  await page.getByRole("button", { name: "Tạo PO đề xuất 2.368" }).click();
  await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra & gửi duyệt" }).click();
  await expect(page.getByText("Kế hoạch sẽ được duyệt 1 cấp")).toBeVisible();
  await page.getByRole("button", { name: "Gửi duyệt 1 cấp" }).click();
  await expect(page.getByText("Chờ duyệt cấp 1", { exact: true })).toBeVisible();

  await login(page, "approver1@local.test");
  await page.goto("/approvals");
  await page.getByRole("button", { name: "Phê duyệt" }).click();
  await page.getByRole("button", { name: "Xác nhận phê duyệt" }).click();
  await expect(page.getByText("Đã duyệt", { exact: true })).toBeVisible();
});
