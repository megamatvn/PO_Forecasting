import { expect, test, type Page } from "@playwright/test";
import {
  assignProposalWave,
  createApprovedAnnualPlan,
  createManagedAccount,
  createProposalDraft,
  createProposalPolicy,
  createV2Scenario,
  decideProposal,
  registerV2RunUsers,
  requireV2Local,
  roleId,
  saveProposalDraft,
  submitProposal,
  updateOrganizationAssignment,
} from "./v2-support";

async function loginWithPrefix(page: Page, prefix: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(prefix);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Purchase Planning V2 admin transfer and account creation", () => {
  test("Admin transfers Manager/Executive and pending work atomically", async ({ browser }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "admin-transfer");
    try {
      const baseline = await createApprovedAnnualPlan(scenario, "manager");
      const adminPage = await scenario.session("administrator");
      await createProposalPolicy(adminPage, {
        brandIds: [scenario.brand.id],
        mode: "fixed_two_level",
        thresholdAmount: null,
      });

      const replacementExecutive = await createManagedAccount(adminPage, {
        emailPrefix: `exec-${scenario.runId.slice(0, 8)}`,
        displayName: "E2E Replacement Executive",
        tier: "executive",
        supervisorId: null,
        capabilities: [
          "create_annual_plan",
          "view_approved_plan",
          "create_purchase_proposal",
        ],
        brandIds: [scenario.brand.id],
      });
      scenario.createdUserIds.push(replacementExecutive.user.id);
      await registerV2RunUsers(adminPage, scenario.runId, [replacementExecutive.user.id]);

      const replacementManager = await createManagedAccount(adminPage, {
        emailPrefix: `mgr-${scenario.runId.slice(0, 8)}`,
        displayName: "E2E Replacement Manager",
        tier: "manager",
        supervisorId: replacementExecutive.user.id,
        capabilities: [
          "create_annual_plan",
          "view_approved_plan",
          "create_purchase_proposal",
        ],
        brandIds: [scenario.brand.id],
      });
      scenario.createdUserIds.push(replacementManager.user.id);
      await registerV2RunUsers(adminPage, scenario.runId, [replacementManager.user.id]);

      const leaderPage = await scenario.session("leader");
      const draft = await createProposalDraft(leaderPage, {
        brandId: scenario.brand.id,
        reason: "Đề xuất để kiểm tra chuyển pending work khi đổi người phụ trách.",
      });
      const saved = await saveProposalDraft(leaderPage, draft.proposalId, draft.lockVersion, [
        { productId: scenario.products[0]!.id, requestedQty: 25 },
      ]);
      await submitProposal(leaderPage, draft.proposalId, saved.lockVersion);

      const managerPage = await scenario.session("manager");
      const assigned = await assignProposalWave(
        managerPage,
        draft.proposalId,
        saved.lockVersion + 1,
        baseline.waveId,
      );
      expect(assigned.status).toBe("pending_manager");

      await updateOrganizationAssignment(adminPage, {
        userId: roleId("manager"),
        tier: "manager",
        isActive: false,
        supervisorId: null,
        capabilities: [
          "create_annual_plan",
          "view_approved_plan",
          "create_purchase_proposal",
        ],
        brandIds: [scenario.brand.id],
        replacementUserId: replacementManager.user.id,
      });

      const replacementManagerPage = await browser.newPage();
      await loginWithPrefix(
        replacementManagerPage,
        `mgr-${scenario.runId.slice(0, 8)}`,
        replacementManager.password,
      );
      const pendingExecutive = await decideProposal(
        replacementManagerPage,
        draft.proposalId,
        "approve",
      );
      expect(pendingExecutive.status).toBe("pending_executive");

      await updateOrganizationAssignment(adminPage, {
        userId: roleId("executive"),
        tier: "executive",
        isActive: false,
        supervisorId: null,
        capabilities: [
          "create_annual_plan",
          "view_approved_plan",
          "create_purchase_proposal",
        ],
        brandIds: [scenario.brand.id],
        replacementUserId: replacementExecutive.user.id,
      });

      const replacementExecutivePage = await browser.newPage();
      await loginWithPrefix(
        replacementExecutivePage,
        `exec-${scenario.runId.slice(0, 8)}`,
        replacementExecutive.password,
      );
      const approved = await decideProposal(
        replacementExecutivePage,
        draft.proposalId,
        "approve",
      );
      expect(approved.status).toBe("approved");

      await replacementExecutivePage.close();
      await replacementManagerPage.close();
    } finally {
      await scenario.cleanup();
    }
  });

  test("Login accepts Sagen email prefix and account creation never exposes the initial password in API output", async ({
    browser,
  }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "prefix-login-password");
    try {
      const adminPage = await scenario.session("administrator");
      const created = await createManagedAccount(adminPage, {
        emailPrefix: `viewer-${scenario.runId.slice(0, 8)}`,
        displayName: "E2E Prefix Login Viewer",
        tier: "employee_viewer",
        supervisorId: null,
        capabilities: ["view_approved_plan"],
        brandIds: [scenario.brand.id],
      });
      scenario.createdUserIds.push(created.user.id);
      await registerV2RunUsers(adminPage, scenario.runId, [created.user.id]);

      expect(created.responseText).not.toContain(created.password);
      await expect(adminPage.getByText(created.password)).toHaveCount(0);

      const viewerPage = await browser.newPage();
      await loginWithPrefix(
        viewerPage,
        `viewer-${scenario.runId.slice(0, 8)}`,
        created.password,
      );
      await viewerPage.close();
    } finally {
      await scenario.cleanup();
    }
  });
});
