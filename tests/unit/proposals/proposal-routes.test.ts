import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const proposalId = "90000000-0000-4000-8000-000000000302";
const brandId = "90000000-0000-4000-8000-000000000101";
const productId = "90000000-0000-4000-8000-000000000201";
const waveId = "90000000-0000-4000-8000-000000000401";
const key = "90000000-0000-4000-8000-000000000202";

function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("purchase proposal routes", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } });
    rpc.mockReset();
    createServerSupabaseClient.mockReset().mockResolvedValue({ auth: { getUser }, rpc });
  });

  it("creates a month-level draft without exposing plan quantities", async () => {
    rpc.mockResolvedValue({ data: { proposalId, revisionId: "90000000-0000-4000-8000-000000000303", status: "draft" }, error: null });
    const { POST } = await import("@/app/api/v2/proposals/route");
    const response = await POST(request("/api/v2/proposals", { brandId, planningYear: 2026, neededMonth: "2026-03", reason: "Bổ sung nhu cầu bán hàng", idempotencyKey: key }));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_or_resume_proposal_v2", expect.objectContaining({ p_needed_month: "2026-03-01" }));
    expect(JSON.stringify(await response.json())).not.toContain("exPrice");
  });

  it("saves only product and requested quantity rows", async () => {
    rpc.mockResolvedValue({ data: { proposalId, lockVersion: 1 }, error: null });
    const { PATCH } = await import("@/app/api/v2/proposals/[proposalId]/route");
    const response = await PATCH(request(`/api/v2/proposals/${proposalId}`, { lockVersion: 0, idempotencyKey: key, lines: [{ productId, requestedQty: 55000 }] }), { params: Promise.resolve({ proposalId }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("save_proposal_v2", expect.objectContaining({ p_lines: [{ productId, requestedQty: 55000 }] }));
  });

  it("requires a selected PO when the manager approves", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "PROPOSAL_WAVE_REQUIRED" } });
    const { POST } = await import("@/app/api/v2/proposals/[proposalId]/decision/route");
    const response = await POST(request(`/api/v2/proposals/${proposalId}/decision`, { decision: "approve", comment: "Đã kiểm tra.", idempotencyKey: key }), { params: Promise.resolve({ proposalId }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "PROPOSAL_WAVE_REQUIRED" } });
  });

  it("maps wave assignment to the atomic capacity command", async () => {
    rpc.mockResolvedValue({ data: { proposalId, status: "pending_manager", overPlan: true }, error: null });
    const { POST } = await import("@/app/api/v2/proposals/[proposalId]/assign-wave/route");
    const response = await POST(request(`/api/v2/proposals/${proposalId}/assign-wave`, { lockVersion: 1, waveId, idempotencyKey: key }), { params: Promise.resolve({ proposalId }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("assign_proposal_wave_v2", { p_proposal_id: proposalId, p_expected_lock_version: 1, p_wave_id: waveId, p_idempotency_key: key });
    expect(await response.json()).toMatchObject({ ok: true, data: { overPlan: true } });
  });

  it("rejects invalid proposal ids before calling Supabase", async () => {
    const { POST } = await import("@/app/api/v2/proposals/[proposalId]/submit/route");
    const response = await POST(request("/api/v2/proposals/bad/submit", { lockVersion: 0, idempotencyKey: key }), { params: Promise.resolve({ proposalId: "bad" }) });
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("routes cancellation decisions through the atomic V2 command", async () => {
    rpc.mockResolvedValue({ data: { proposalId, status: "cancelled", capacityReleased: true }, error: null });
    const { POST } = await import("@/app/api/v2/proposals/[proposalId]/cancellation-decision/route");
    const response = await POST(
      request(`/api/v2/proposals/${proposalId}/cancellation-decision`, {
        decision: "approve",
        comment: "Đã kiểm tra và đồng ý hủy đề xuất.",
        idempotencyKey: key,
      }),
      { params: Promise.resolve({ proposalId }) },
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("decide_proposal_cancellation_v2", {
      p_proposal_id: proposalId,
      p_decision: "approve",
      p_comment: "Đã kiểm tra và đồng ý hủy đề xuất.",
      p_idempotency_key: key,
    });
    expect(await response.json()).toMatchObject({ ok: true, data: { capacityReleased: true } });
  });

  it("requires a reason when a cancellation is rejected", async () => {
    const { POST } = await import("@/app/api/v2/proposals/[proposalId]/cancellation-decision/route");
    const response = await POST(
      request(`/api/v2/proposals/${proposalId}/cancellation-decision`, {
        decision: "reject",
        comment: "ngắn",
        idempotencyKey: key,
      }),
      { params: Promise.resolve({ proposalId }) },
    );
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});
