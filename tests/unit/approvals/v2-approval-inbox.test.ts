import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const ids = {
  manager: "90000000-0000-4000-8000-000000000001",
  executive: "90000000-0000-4000-8000-000000000002",
  administrator: "90000000-0000-4000-8000-000000000003",
  leader: "90000000-0000-4000-8000-000000000004",
  brand: "90000000-0000-4000-8000-000000000101",
  annualCase: "90000000-0000-4000-8000-000000000201",
  annualRevision: "90000000-0000-4000-8000-000000000202",
  proposal: "90000000-0000-4000-8000-000000000301",
  cancellation: "90000000-0000-4000-8000-000000000302",
  otherProposal: "90000000-0000-4000-8000-000000000303",
  proposalRevision: "90000000-0000-4000-8000-000000000401",
  cancellationRevision: "90000000-0000-4000-8000-000000000402",
  wave: "90000000-0000-4000-8000-000000000501",
};

const access = (userId: string, tier: "manager" | "executive" = "manager", isAdministrator = false) => ({
  userId,
  displayName: "Người duyệt",
  tier,
  isAdministrator,
  capabilities: [],
  supervisorId: null,
  executiveId: null,
  brands: [],
});

function query(data: unknown[]) {
  const result = { data, error: null };
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    then: PromiseLike<typeof result>["then"];
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function inboxClient() {
  const annualCases = [
    {
      id: ids.annualCase,
      target_id: ids.annualRevision,
      target_kind: "annual_plan",
      status: "pending",
      brand_id: ids.brand,
      submitted_by: ids.leader,
      assigned_executive_id: ids.executive,
      submitted_at: "2026-08-18T00:00:00.000Z",
    },
  ];
  const managerRows = [
    {
      id: ids.proposal,
      status: "pending_manager",
      planning_year: 2026,
      owner_id: ids.leader,
      assigned_manager_id: ids.manager,
      assigned_executive_id: ids.executive,
      updated_at: "2026-08-18T01:00:00.000Z",
      brands: { code: "ET", name: "Etiaxil" },
      profiles: { display_name: "Leader ET" },
    },
    {
      id: ids.cancellation,
      status: "cancellation_pending_manager",
      planning_year: 2026,
      owner_id: ids.leader,
      assigned_manager_id: ids.manager,
      assigned_executive_id: ids.executive,
      updated_at: "2026-08-18T02:00:00.000Z",
      brands: { code: "ET", name: "Etiaxil" },
      profiles: { display_name: "Leader ET" },
    },
    {
      id: ids.otherProposal,
      status: "pending_manager",
      planning_year: 2026,
      owner_id: ids.leader,
      assigned_manager_id: ids.leader,
      assigned_executive_id: ids.leader,
      updated_at: "2026-08-18T03:00:00.000Z",
      brands: { code: "ET", name: "Etiaxil" },
      profiles: { display_name: "Không được giao" },
    },
  ];
  const executiveRows = [
    {
      ...managerRows[0],
      status: "pending_executive",
      assigned_manager_id: ids.manager,
      assigned_executive_id: ids.executive,
    },
    {
      ...managerRows[1],
      status: "cancellation_pending_executive",
      assigned_manager_id: ids.manager,
      assigned_executive_id: ids.executive,
    },
    {
      ...managerRows[2],
      status: "pending_executive",
      assigned_manager_id: ids.leader,
      assigned_executive_id: ids.leader,
    },
  ];
  const revisions = [
    { id: ids.proposalRevision, proposal_id: ids.proposal, revision_number: 1 },
    { id: ids.cancellationRevision, proposal_id: ids.cancellation, revision_number: 1 },
  ];
  const snapshots = [
    { proposal_revision_id: ids.proposalRevision, selected_wave_id: ids.wave, over_plan: true },
    { proposal_revision_id: ids.cancellationRevision, selected_wave_id: ids.wave, over_plan: false },
  ];
  const rows: Record<string, unknown[]> = {
    workflow_approval_cases: annualCases,
    purchase_proposals: [...managerRows, ...executiveRows],
    proposal_revisions: revisions,
    proposal_route_snapshots: snapshots,
    purchase_waves: [{ id: ids.wave, wave_number: 7 }],
    annual_plan_revisions: [{ id: ids.annualRevision, cycle_id: "90000000-0000-4000-8000-000000000601" }],
    annual_plan_cycles: [{ id: "90000000-0000-4000-8000-000000000601", planning_year: 2026 }],
    brands: [{ id: ids.brand, code: "ET", name: "Etiaxil" }],
    profiles: [{ id: ids.leader, display_name: "Leader ET" }],
  };
  const from = vi.fn((table: string) => query(rows[table] ?? []));
  return { from };
}

describe("loadV2ApprovalInbox", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset().mockResolvedValue(inboxClient());
  });

  it("shows a Manager only proposal and cancellation work directly assigned to them", async () => {
    const { loadV2ApprovalInbox } = await import("@/features/approvals/server/load-approval-inbox");
    const items = await loadV2ApprovalInbox(access(ids.manager));

    expect(items.map((item) => [item.kind, item.targetId, item.href])).toEqual([
      ["proposal_cancellation", ids.cancellation, `/proposals/${ids.cancellation}`],
      ["purchase_proposal", ids.proposal, `/proposals/${ids.proposal}`],
    ]);
    expect(items[1]).toMatchObject({
      assigneeId: ids.manager,
      currentLevel: "manager",
      overPlan: true,
      assignedPoLabel: "PO 7",
    });
  });

  it("shows an Executive only their directly assigned annual-plan and L2 proposal work", async () => {
    const { loadV2ApprovalInbox } = await import("@/features/approvals/server/load-approval-inbox");
    const items = await loadV2ApprovalInbox(access(ids.executive, "executive"));

    expect(items.map((item) => [item.kind, item.targetId])).toEqual([
      ["proposal_cancellation", ids.cancellation],
      ["purchase_proposal", ids.proposal],
      ["annual_plan", ids.annualRevision],
    ]);
    expect(items).toContainEqual(expect.objectContaining({
      kind: "annual_plan",
      href: `/annual-plans/${ids.annualRevision}?step=review`,
      assigneeId: ids.executive,
      currentLevel: "executive",
    }));
  });

  it("does not turn Administrator privilege into a decision assignment", async () => {
    const client = inboxClient();
    createServerSupabaseClient.mockResolvedValueOnce(client);
    const { loadV2ApprovalInbox } = await import("@/features/approvals/server/load-approval-inbox");
    const items = await loadV2ApprovalInbox(access(ids.administrator, "manager", true));

    expect(items).toEqual([]);
    expect(client.from.mock.calls.map(([table]) => table)).not.toEqual(expect.arrayContaining([
      "approval_requests",
      "version_diffs",
      "plan_projection_view",
    ]));
  });
});
