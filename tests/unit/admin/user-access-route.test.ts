import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

describe("user access route", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset();
  });

  it("updates roles and brands through one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin" } } }) },
      rpc,
    });
    const { POST } = await import("@/app/api/admin/users/access/route");
    const body = {
      userId: "90000000-0000-0000-0000-000000000002",
      roles: ["planner", "approver_l1"],
      brandIds: ["10000000-0000-0000-0000-000000000001"],
      isActive: true,
      idempotencyKey: "81000000-0000-0000-0000-000000000001",
    };
    const response = await POST(new Request("http://localhost/api/admin/users/access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_user_access", {
      p_user_id: body.userId,
      p_roles: body.roles,
      p_brand_ids: body.brandIds,
      p_is_active: true,
      p_idempotency_key: body.idempotencyKey,
    });
  });
});
