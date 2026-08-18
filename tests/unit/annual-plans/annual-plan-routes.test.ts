import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

function request(body: unknown, path = "http://localhost/api/v2/annual-plans") {
  return new Request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("annual plan V2 routes", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } });
    rpc.mockReset();
    from.mockReset();
    createServerSupabaseClient.mockReset().mockResolvedValue({ auth: { getUser }, rpc, from });
  });

  it("rejects a past planning year before touching the database", async () => {
    const { POST } = await import("@/app/api/v2/annual-plans/route");
    const response = await POST(request({
      brandId: "90000000-0000-4000-8000-000000000101",
      planningYear: 2025,
      idempotencyKey: "90000000-0000-4000-8000-000000000201",
    }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "PAST_PLANNING_YEAR" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates or resumes a draft through the V2 command", async () => {
    rpc.mockResolvedValue({
      data: {
        cycleId: "90000000-0000-4000-8000-000000000301",
        revisionId: "90000000-0000-4000-8000-000000000302",
        revisionNumber: 1,
        planningYear: 2026,
        status: "draft_owner_only",
        lockVersion: 0,
      },
      error: null,
    });
    const { POST } = await import("@/app/api/v2/annual-plans/route");
    const response = await POST(request({
      brandId: "90000000-0000-4000-8000-000000000101",
      planningYear: 2026,
      idempotencyKey: "90000000-0000-4000-8000-000000000201",
    }));

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_or_resume_annual_plan_v2", {
      p_brand_id: "90000000-0000-4000-8000-000000000101",
      p_planning_year: 2026,
      p_idempotency_key: "90000000-0000-4000-8000-000000000201",
    });
    expect(await response.json()).toMatchObject({ ok: true, data: { revisionId: expect.any(String) } });
  });

  it("returns a generic conflict without another owner's draft details", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "duplicate key value violates unique constraint" } });
    const { POST } = await import("@/app/api/v2/annual-plans/route");
    const response = await POST(request({
      brandId: "90000000-0000-4000-8000-000000000101",
      planningYear: 2026,
      idempotencyKey: "90000000-0000-4000-8000-000000000201",
    }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.message).toBe("Chu kỳ đang được chuẩn bị bởi một người dùng khác.");
    expect(JSON.stringify(body)).not.toContain("ownerId");
  });

  it("saves scope with lock version and maps an optimistic conflict to 409", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ANNUAL_PLAN_LOCK_CONFLICT" } });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/scope/route");
    const revisionId = "90000000-0000-4000-8000-000000000302";
    const response = await POST(request({
      expectedLockVersion: 0,
      idempotencyKey: "90000000-0000-4000-8000-000000000202",
    }, `http://localhost/api/v2/annual-plans/${revisionId}/scope`), { params: Promise.resolve({ revisionId }) });

    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledWith("save_annual_plan_scope_v2", {
      p_revision_id: revisionId,
      p_expected_lock_version: 0,
      p_idempotency_key: "90000000-0000-4000-8000-000000000202",
    });
  });
});
