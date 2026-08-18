import { expect, test } from "@playwright/test";
import {
  assignProposalWave,
  createApprovedAnnualPlan,
  createProposalDraft,
  createProposalPolicy,
  createV2Scenario,
  decideProposal,
  requireV2Local,
  saveProposalDraft,
  submitProposal,
} from "./v2-support";

test.describe("Purchase Planning V2 approval work center", () => {
  test("shows each directly assigned proposal approval at the correct work-center level", async ({ browser }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "proposal-approval-work-center");
    try {
      const baseline = await createApprovedAnnualPlan(scenario, "manager");
      const administratorPage = await scenario.session("administrator");
      await createProposalPolicy(administratorPage, {
        brandIds: [scenario.brand.id],
        mode: "fixed_two_level",
        thresholdAmount: null,
      });

      const leaderPage = await scenario.session("leader");
      const draft = await createProposalDraft(leaderPage, {
        brandId: scenario.brand.id,
        reason: "Đề xuất để xác nhận danh sách công việc phê duyệt V2.",
      });
      const saved = await saveProposalDraft(leaderPage, draft.proposalId, draft.lockVersion, [
        { productId: scenario.products[0]!.id, requestedQty: 25 },
      ]);
      await submitProposal(leaderPage, draft.proposalId, saved.lockVersion);

      const managerPage = await scenario.session("manager");
      await managerPage.goto("/approvals");
      const managerLink = managerPage.locator(`a[href="/proposals/${draft.proposalId}"]`);
      await expect(managerPage.getByText(/Quản lý · Cấp 1/).first()).toBeVisible();
      await expect(managerLink).toHaveAttribute("href", `/proposals/${draft.proposalId}`);

      const assigned = await assignProposalWave(managerPage, draft.proposalId, saved.lockVersion + 1, baseline.waveId);
      await decideProposal(managerPage, draft.proposalId, "approve");
      expect(assigned.status).toBe("pending_manager");

      const executivePage = await scenario.session("executive");
      await executivePage.goto("/approvals");
      await expect(executivePage.getByText(/CEO\/BOD · Cấp 2/).first()).toBeVisible();
      await expect(executivePage.locator(`a[href="/proposals/${draft.proposalId}"]`)).toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });
});
