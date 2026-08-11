import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const requestId = "70000000-0000-0000-0000-000000000001";

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/approvals/${requestId}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("approval decision route", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset();
  });

  it("calls the idempotent approval RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "pending_l2", error: null });
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) },
      rpc,
    });
    const { POST } = await import("@/app/api/approvals/[requestId]/decision/route");

    const response = await POST(
      makeRequest({
        action: "approve",
        comment: "Đồng ý",
        idempotencyKey: "71000000-0000-0000-0000-000000000001",
      }),
      { params: Promise.resolve({ requestId }) },
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("approve_step", {
      p_approval_request_id: requestId,
      p_idempotency_key: "71000000-0000-0000-0000-000000000001",
      p_comment: "Đồng ý",
    });
  });

  it("rejects an empty request-changes reason", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) },
      rpc: vi.fn(),
    });
    const { POST } = await import("@/app/api/approvals/[requestId]/decision/route");

    const response = await POST(
      makeRequest({
        action: "request_changes",
        comment: "   ",
        idempotencyKey: "71000000-0000-0000-0000-000000000001",
      }),
      { params: Promise.resolve({ requestId }) },
    );

    expect(response.status).toBe(400);
  });
});
