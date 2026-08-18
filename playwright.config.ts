import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/._*"],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.E2E_DATABASE_MODE === "local" ? 1 : undefined,
  reporter: "html",
  metadata: {
    e2eDatabaseMode: process.env.E2E_DATABASE_MODE ?? "unset",
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    env: {
      ...process.env,
      E2E_MODE: "true",
      E2E_RESET_TOKEN:
        process.env.E2E_RESET_TOKEN ?? "local-e2e-reset-token",
    },
  },
});
