import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const planVersionId = "41000000-0000-0000-0000-000000000080";
const idempotencyKey = "81000000-0000-0000-0000-000000000080";

function request(body: unknown) {
  return new Request(`http://localhost/api/planning/${planVersionId}/revision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/planning/[planVersionId]/revision", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset();
  });

  it("creates an idempotent Draft revision", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "41000000-0000-0000-0000-000000000081",
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "90000000-0000-0000-0000-000000000080" } },
        }),
      },
      rpc,
    });
    const { POST } = await import("@/app/api/planning/[planVersionId]/revision/route");

    const response = await POST(request({ planVersionId, idempotencyKey }), {
      params: Promise.resolve({ planVersionId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      revisionId: "41000000-0000-0000-0000-000000000081",
    });
    expect(rpc).toHaveBeenCalledWith("create_plan_revision", {
      p_source_plan_version_id: planVersionId,
      p_idempotency_key: idempotencyKey,
    });
  });

  it("maps immutable source errors to a conflict", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "90000000-0000-0000-0000-000000000080" } },
        }),
      },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "revision_source_must_be_approved_or_changes_requested" },
      }),
    });
    const { POST } = await import("@/app/api/planning/[planVersionId]/revision/route");

    const response = await POST(request({ planVersionId, idempotencyKey }), {
      params: Promise.resolve({ planVersionId }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "revision_source_invalid",
    });
  });
});
