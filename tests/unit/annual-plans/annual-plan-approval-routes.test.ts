import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const revisionId = "90000000-0000-4000-8000-000000000302";
const idempotencyKey = "90000000-0000-4000-8000-000000000202";

function request(body: unknown, path = "http://localhost/api/v2/annual-plans/revision/submit") {
  return new Request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("annual plan approval routes", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } });
    rpc.mockReset();
    createServerSupabaseClient.mockReset().mockResolvedValue({ auth: { getUser }, rpc });
  });

  it("submits a manager-owned plan to the assigned executive", async () => {
    rpc.mockResolvedValue({ data: { revisionId, status: "pending_executive", assignedExecutiveId: "90000000-0000-4000-8000-000000000009" }, error: null });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/submit/route");
    const response = await POST(request({ lockVersion: 3, idempotencyKey }), { params: Promise.resolve({ revisionId }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("submit_annual_plan_v2", {
      p_revision_id: revisionId,
      p_expected_lock_version: 3,
      p_idempotency_key: idempotencyKey,
    });
    expect(await response.json()).toMatchObject({ ok: true, data: { status: "pending_executive" } });
  });

  it("maps allocation revalidation errors to a localized 422", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "PURCHASE_WAVE_ALLOCATION_MISMATCH" } });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/submit/route");
    const response = await POST(request({ lockVersion: 3, idempotencyKey }), { params: Promise.resolve({ revisionId }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "ANNUAL_PLAN_ALLOCATION_MISMATCH" } });
  });

  it("approves or requests changes through the exact command", async () => {
    rpc.mockResolvedValue({ data: { revisionId, status: "approved" }, error: null });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/decision/route");
    const response = await POST(request({ decision: "approve", comment: "Đã kiểm tra.", idempotencyKey }, `http://localhost/api/v2/annual-plans/${revisionId}/decision`), { params: Promise.resolve({ revisionId }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("decide_annual_plan_v2", {
      p_revision_id: revisionId,
      p_decision: "approve",
      p_comment: "Đã kiểm tra.",
      p_idempotency_key: idempotencyKey,
    });
  });

  it("creates a new owner draft when the executive requests changes", async () => {
    rpc.mockResolvedValue({ data: { previousRevisionId: revisionId, revisionId: "90000000-0000-4000-8000-000000000303", status: "draft_owner_only" }, error: null });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/decision/route");
    const response = await POST(request({ decision: "request_changes", comment: "Bổ sung tháng giao hàng.", idempotencyKey }, `http://localhost/api/v2/annual-plans/${revisionId}/decision`), { params: Promise.resolve({ revisionId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { status: "draft_owner_only", revisionId: "90000000-0000-4000-8000-000000000303" } });
  });

  it("does not allow a revision route to accept a non-UUID", async () => {
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/submit/route");
    const response = await POST(request({ lockVersion: 0, idempotencyKey }), { params: Promise.resolve({ revisionId: "bad" }) });
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});
