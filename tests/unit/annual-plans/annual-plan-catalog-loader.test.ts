import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrganizationContext = vi.fn();
const from = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock("@/features/organization/server/get-organization-context", () => ({ getOrganizationContext }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const ids = {
  user: "90000000-0000-4000-8000-000000000001",
  otherUser: "90000000-0000-4000-8000-000000000002",
  brand: "90000000-0000-4000-8000-000000000101",
  cycle: "90000000-0000-4000-8000-000000000201",
  draft: "90000000-0000-4000-8000-000000000301",
  pending: "90000000-0000-4000-8000-000000000302",
  approvedOld: "90000000-0000-4000-8000-000000000303",
  approvedCurrent: "90000000-0000-4000-8000-000000000304",
  history: "90000000-0000-4000-8000-000000000305",
  otherDraft: "90000000-0000-4000-8000-000000000306",
};

function revision(id: string, status: string, ownerId: string, revisionNumber: number, updatedAt: string) {
  return {
    id,
    cycle_id: ids.cycle,
    owner_id: ownerId,
    revision_number: revisionNumber,
    status,
    updated_at: updatedAt,
    submitted_at: status === "pending_executive" ? "2026-08-03T00:00:00.000Z" : null,
    approved_at: status === "approved" ? updatedAt : null,
    annual_plan_cycles: {
      id: ids.cycle,
      brand_id: ids.brand,
      planning_year: 2026,
      brands: { code: "ET", name: "Etiaxil" },
    },
  };
}

describe("annual plan catalog loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00.000Z"));
    getOrganizationContext.mockReset().mockResolvedValue({
      userId: ids.user,
      displayName: "Nguyễn Văn A",
      tier: "manager",
      isAdministrator: true,
      capabilities: ["create_annual_plan", "view_approved_plan"],
      supervisorId: null,
      executiveId: null,
      brands: [{ id: ids.brand, code: "ET", name: "Etiaxil", capabilities: ["create_annual_plan", "view_approved_plan"], sources: ["role"] }],
    });
    const rows = [
      revision(ids.draft, "draft_owner_only", ids.user, 1, "2026-08-01T00:00:00.000Z"),
      revision(ids.pending, "pending_executive", ids.user, 2, "2026-08-02T00:00:00.000Z"),
      revision(ids.approvedOld, "superseded", ids.user, 1, "2026-07-01T00:00:00.000Z"),
      revision(ids.approvedCurrent, "approved", ids.user, 2, "2026-08-04T00:00:00.000Z"),
      revision(ids.history, "changes_requested", ids.user, 3, "2026-08-05T00:00:00.000Z"),
      revision(ids.otherDraft, "draft_owner_only", ids.otherUser, 4, "2026-08-06T00:00:00.000Z"),
    ];
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    from.mockReset().mockReturnValue(query);
    createServerSupabaseClient.mockReset().mockResolvedValue({ from });
  });

  it("separates private drafts, own pending work, approved baseline and revision history", async () => {
    const { loadAnnualPlanCatalog } = await import("@/features/annual-plans/server/load-annual-plan-catalog");
    const catalog = await loadAnnualPlanCatalog();

    expect(catalog?.myDrafts.map((item) => item.revisionId)).toEqual([ids.draft]);
    expect(catalog?.myPending.map((item) => item.revisionId)).toEqual([ids.pending]);
    expect(catalog?.approvedBaselines.map((item) => item.revisionId)).toEqual([ids.approvedCurrent]);
    expect(catalog?.revisionHistory.map((item) => item.revisionId)).toEqual([ids.history, ids.approvedOld]);
    expect(JSON.stringify(catalog)).not.toContain(ids.otherUser);
    expect(JSON.stringify(catalog)).not.toContain("ownerName");
  });

  it("shows only generic metadata for another owner's draft and supports distant future years", async () => {
    const { loadAnnualPlanCatalog } = await import("@/features/annual-plans/server/load-annual-plan-catalog");
    const catalog = await loadAnnualPlanCatalog();

    expect(catalog?.draftConflicts).toEqual([{ brandId: ids.brand, brandCode: "ET", brandName: "Etiaxil", planningYear: 2026 }]);
    expect(catalog?.draftConflicts[0]).not.toHaveProperty("revisionId");
    expect(catalog?.planningYears[0]).toBe(2026);
    expect(catalog?.planningYears).toContain(2200);
    expect(catalog?.planningYears).not.toContain(2025);
  });

  it("does not surface another owner's draft to a non-administrator", async () => {
    getOrganizationContext.mockResolvedValueOnce({
      userId: ids.user,
      displayName: "Manager",
      tier: "manager",
      isAdministrator: false,
      capabilities: ["create_annual_plan"],
      supervisorId: null,
      executiveId: null,
      brands: [{ id: ids.brand, code: "ET", name: "Etiaxil", capabilities: ["create_annual_plan"], sources: ["role"] }],
    });
    const { loadAnnualPlanCatalog } = await import("@/features/annual-plans/server/load-annual-plan-catalog");
    const catalog = await loadAnnualPlanCatalog();
    expect(catalog?.draftConflicts).toEqual([]);
    expect(catalog?.myDrafts.map((item) => item.revisionId)).toEqual([ids.draft]);
  });

  it("keeps an approved baseline visible to a viewer while leaving revision creation to creators", async () => {
    getOrganizationContext.mockResolvedValueOnce({
      userId: ids.user,
      displayName: "CEO",
      tier: "executive",
      isAdministrator: false,
      capabilities: ["view_approved_plan"],
      supervisorId: null,
      executiveId: null,
      brands: [{ id: ids.brand, code: "ET", name: "Etiaxil", capabilities: ["view_approved_plan"], sources: ["role"] }],
    });
    const { loadAnnualPlanCatalog } = await import("@/features/annual-plans/server/load-annual-plan-catalog");
    const catalog = await loadAnnualPlanCatalog();
    expect(catalog?.approvedBaselines.map((item) => item.revisionId)).toEqual([ids.approvedCurrent]);
    expect(catalog?.canCreatePlan).toBe(false);
  });
});
