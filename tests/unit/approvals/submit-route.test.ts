import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const planVersionId = "41000000-0000-0000-0000-000000000001";

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/planning/${planVersionId}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("plan submission route", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset();
  });

  it("previews the server-side route without changing the plan", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { levels: 2, reason: "fixed" },
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) },
      rpc,
    });
    const { POST } = await import("@/app/api/planning/[planVersionId]/submit/route");

    const response = await POST(
      makeRequest({
        action: "preview",
        exceptionFlags: { criticalShortage: true },
      }),
      { params: Promise.resolve({ planVersionId }) },
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("preview_plan_approval_route", {
      p_plan_version_id: planVersionId,
      p_exception_flags: { criticalShortage: true },
    });
  });

  it("submits with the same exception set and idempotency key", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "70000000-0000-0000-0000-000000000001",
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) },
      rpc,
    });
    const { POST } = await import("@/app/api/planning/[planVersionId]/submit/route");
    const idempotencyKey = "71000000-0000-0000-0000-000000000001";

    const response = await POST(
      makeRequest({
        action: "submit",
        exceptionFlags: { criticalShortage: true },
        idempotencyKey,
      }),
      { params: Promise.resolve({ planVersionId }) },
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("submit_plan", {
      p_plan_version_id: planVersionId,
      p_idempotency_key: idempotencyKey,
      p_exception_flags: { criticalShortage: true },
    });
  });
});
