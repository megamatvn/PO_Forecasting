import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

const planVersionId = "41000000-0000-0000-0000-000000000001";

function request(body: unknown) {
  return new Request(`http://localhost/api/planning/${planVersionId}/draft`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function payload() {
  return {
    planVersionId,
    expectedLockVersion: 0,
    idempotencyKey: "51000000-0000-0000-0000-000000000001",
    changes: {
      purchaseProposals: [
        {
          productId: "20000000-0000-0000-0000-000000000150",
          qty: 2368,
          focQty: 0,
          exPrice: "2.71",
        },
      ],
    },
  };
}

describe("POST /api/planning/[planVersionId]/draft", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset();
  });

  it("saves workspace changes with optimistic locking", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "90000000-0000-0000-0000-000000000001" } },
        }),
      },
      rpc,
    });
    const { POST } = await import("@/app/api/planning/[planVersionId]/draft/route");

    const response = await POST(request(payload()), {
      params: Promise.resolve({ planVersionId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ lockVersion: 1 });
    expect(rpc).toHaveBeenCalledWith("save_planning_workspace", {
      p_plan_version_id: planVersionId,
      p_expected_lock_version: 0,
      p_changes: payload().changes,
      p_idempotency_key: "51000000-0000-0000-0000-000000000001",
    });
  });

  it("returns the current remote lock on a version conflict", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "90000000-0000-0000-0000-000000000001" } },
        }),
      },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "PLAN_VERSION_CONFLICT" },
      }),
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { lock_version: 2 }, error: null }),
          }),
        }),
      }),
    });
    const { POST } = await import("@/app/api/planning/[planVersionId]/draft/route");

    const response = await POST(request(payload()), {
      params: Promise.resolve({ planVersionId }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "PLAN_VERSION_CONFLICT",
      remoteLockVersion: 2,
    });
  });
});
