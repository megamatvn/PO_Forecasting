import { expect, test, type Page } from "@playwright/test";

const localPassword = "Local" + "Demo!2026";

export interface E2ECycle {
  cycleId: string;
  versionId: string;
  code: string;
}

export function requireLocalSupabase() {
  test.skip(process.env.E2E_DATABASE_MODE !== "local", "Requires isolated local Supabase.");
}

export async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(localPassword);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function resetCycle(page: Page): Promise<E2ECycle> {
  const runId = crypto.randomUUID();
  const result = await page.evaluate(async (id) => {
    const response = await fetch("/api/e2e/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: id }),
    });
    return { status: response.status, body: await response.json() };
  }, runId);
  expect(result.status).toBe(200);
  return result.body as E2ECycle;
}
