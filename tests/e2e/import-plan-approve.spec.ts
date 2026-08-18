import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { login, requireLocalSupabase, resetCycle } from "./support";

test("ET-015150 đi qua Auth, import, PO và duyệt hai cấp trên Supabase", async ({ page }) => {
  requireLocalSupabase();
  const runId = crypto.randomUUID();
  const workbookPath = join(tmpdir(), `forecast-import-${runId}.xlsx`);

  await login(page, "admin@local.test");
  const cycle = await resetCycle(page);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile("tests/fixtures/forecast-import.synthetic.xlsx");
  workbook.creator = runId;
  workbook.modified = new Date();
  await workbook.xlsx.writeFile(workbookPath);

  try {
    await page.goto("/imports");
    await page.getByLabel("Chọn file Excel").setInputFiles(workbookPath);
    await expect(page.getByText("ET-015027 → ET-015025")).toBeVisible();
    await page.getByRole("checkbox", { name: /Tôi đã kiểm tra các cảnh báo/ }).check();
    await page.getByRole("button", { name: "Xác nhận nhập dữ liệu" }).click();
    await expect(page.getByText("Nhập dữ liệu hoàn tất")).toBeVisible();

    await login(page, "planner@local.test");
    await page.goto(`/planning/${cycle.cycleId}?step=products`);
    await expect(page.getByText(/ET-015150 dự kiến thiếu 2\.368/)).toBeVisible();
    await page.getByRole("button", { name: "Tạo PO đề xuất 2.368" }).click();
    await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Ngân sách" }).click();
    await expect(page.getByRole("heading", { name: "Ngân sách" })).toBeVisible();
    await page.getByRole("link", { name: "Gửi duyệt" }).click();
    await expect(page.getByRole("heading", { name: "Gửi duyệt kế hoạch" })).toBeVisible();
    await page.getByRole("button", { name: "Kiểm tra & gửi duyệt" }).click();
    await expect(page.getByText("Kế hoạch sẽ được duyệt 2 cấp")).toBeVisible();
    await page.getByRole("button", { name: "Gửi duyệt 2 cấp" }).click();
    await expect(page.getByText("Chờ duyệt cấp 1", { exact: true })).toBeVisible();

    await login(page, "approver1@local.test");
    await page.goto("/approvals");
    await page.getByRole("button", { name: "Phê duyệt" }).click();
    await page.getByRole("button", { name: "Xác nhận phê duyệt" }).click();
    await expect(page.getByText("Chờ cấp 2", { exact: true })).toBeVisible();

    await login(page, "approver2@local.test");
    await page.goto("/approvals");
    await page.getByRole("button", { name: "Phê duyệt" }).click();
    await page.getByRole("button", { name: "Xác nhận phê duyệt" }).click();
    await expect(page.getByText("Đã duyệt", { exact: true })).toBeVisible();

    await login(page, "planner@local.test");
    await page.goto(`/versions/${cycle.versionId}`);
    await expect(page.getByText("Bản ghi bất biến")).toBeVisible();
    await page.getByRole("button", { name: "Tạo revision để chỉnh sửa" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/planning/${cycle.cycleId}\\?versionId=[0-9a-f-]+`),
    );
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    const revisionUrl = new URL(page.url());
    const revisionId = revisionUrl.searchParams.get("versionId");
    expect(revisionId).toBeTruthy();

    const qty = page.getByLabel("Số lượng đặt");
    await qty.fill("2000");
    await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();
    await page.goto(`/versions/${revisionId}`);
    await expect(page.getByText(/2 thay đổi/)).toBeVisible();
  } finally {
    await unlink(workbookPath).catch(() => undefined);
  }
});
