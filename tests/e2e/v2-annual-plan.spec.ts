import { expect, test } from "@playwright/test";
import {
  createApprovedAnnualPlan,
  createAnnualPlanDraft,
  createV2Scenario,
  requireV2Local,
  saveAnnualPlanScope,
} from "./v2-support";

test.describe("Purchase Planning V2 annual-plan flows", () => {
  test("Manager manual plan -> exact Executive approval -> approved review and dashboard shell", async ({
    browser,
  }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "manager-manual-plan");
    try {
      const plan = await createApprovedAnnualPlan(scenario, "manager");
      const viewerPage = await scenario.session("viewer");

      await viewerPage.goto(`/annual-plans/${plan.draft.revisionId}?step=review`);
      await expect(
        viewerPage.getByRole("heading", { name: new RegExp(scenario.brand.code) }),
      ).toBeVisible();

      await viewerPage.goto("/dashboard");
      await expect(
        viewerPage.getByRole("heading", { name: "Tổng quan vận hành" }),
      ).toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });

  test("Executive-created plan -> atomic self-approval", async ({ browser }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "executive-self-approval");
    try {
      const plan = await createApprovedAnnualPlan(scenario, "executive");
      expect(plan.submitted.autoApproved).toBe(true);
      expect(plan.submitted.status).toBe("approved");

      const executivePage = await scenario.session("executive");
      await executivePage.goto(`/annual-plans/${plan.draft.revisionId}?step=review`);
      await expect(
        executivePage.getByRole("heading", { name: /^Kế hoạch / }),
      ).toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });

  test("Draft privacy across all five roles", async ({ browser }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "draft-privacy");
    try {
      const managerPage = await scenario.session("manager");
      const draft = await createAnnualPlanDraft(managerPage, scenario.brand.id);
      await saveAnnualPlanScope(managerPage, draft.revisionId, draft.lockVersion);

      await managerPage.goto(`/annual-plans/${draft.revisionId}?step=scope`);
      await expect(
        managerPage.getByRole("heading", { name: "Kế hoạch" }),
      ).toBeVisible();

      const administratorPage = await scenario.session("administrator");
      await administratorPage.goto(`/annual-plans/${draft.revisionId}?step=review`);
      await expect(administratorPage.getByText("Không thể mở bản kế hoạch này.")).toBeVisible();

      await managerPage.goto("/annual-plans");
      await expect(managerPage.getByRole("link", { name: "Tiếp tục bản nháp" })).toBeVisible();

      await administratorPage.goto("/annual-plans");
      await expect(administratorPage.getByRole("heading", { name: "Chu kỳ đang có bản nháp" })).toBeVisible();

      for (const role of ["leader", "executive", "viewer"] as const) {
        const page = await scenario.session(role);
        await page.goto(`/annual-plans/${draft.revisionId}?step=review`);
        await expect(page.getByText("Không thể mở bản kế hoạch này.")).toBeVisible();
      }
    } finally {
      await scenario.cleanup();
    }
  });
});
