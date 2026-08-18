import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const proposalId = "90000000-0000-4000-8000-000000000302";
const key = "90000000-0000-4000-8000-000000000202";

function request(body: unknown) {
  return new Request(`http://localhost/api/v2/proposals/${proposalId}/cancellation-decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("proposal cancellation decision route", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset().mockResolvedValue({
      data: { user: { id: "90000000-0000-4000-8000-000000000001" } },
    });
    rpc.mockReset();
    createServerSupabaseClient.mockReset().mockResolvedValue({
      auth: { getUser },
      rpc,
    });
  });

  it("calls the atomic cancellation decision RPC for an assigned approver", async () => {
    rpc.mockResolvedValue({
      data: { proposalId, status: "cancelled" },
      error: null,
    });

    const { POST } = await import("@/app/api/v2/proposals/[proposalId]/cancellation-decision/route");

    const response = await POST(
      request({
        decision: "approve",
        comment: "Đã xác nhận huỷ và trả lại capacity.",
        idempotencyKey: key,
      }),
      { params: Promise.resolve({ proposalId }) },
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("decide_proposal_cancellation_v2", {
      p_proposal_id: proposalId,
      p_decision: "approve",
      p_comment: "Đã xác nhận huỷ và trả lại capacity.",
      p_idempotency_key: key,
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { proposalId, status: "cancelled" },
    });
  });

  it("rejects unsupported decisions before calling Supabase", async () => {
    const { POST } = await import("@/app/api/v2/proposals/[proposalId]/cancellation-decision/route");

    const response = await POST(
      request({
        decision: "request_changes",
        comment: "Không hợp lệ",
        idempotencyKey: key,
      }),
      { params: Promise.resolve({ proposalId }) },
    );

    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
