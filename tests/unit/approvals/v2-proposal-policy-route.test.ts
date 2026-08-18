import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const brandId = "90000000-0000-4000-8000-000000000101";
const idempotencyKey = "90000000-0000-4000-8000-000000000202";

describe("V2 proposal policy route", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } });
    rpc.mockReset().mockResolvedValue({ data: { policyId: "90000000-0000-4000-8000-000000000303" }, error: null });
    createServerSupabaseClient.mockReset().mockResolvedValue({ auth: { getUser }, rpc });
  });

  it("saves a multi-brand threshold policy through the V2 command", async () => {
    const { POST } = await import("@/app/api/v2/admin/proposal-policies/route");
    const response = await POST(new Request("http://localhost/api/v2/admin/proposal-policies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Đề xuất ETX", mode: "threshold", thresholdAmount: "50000", currencyCode: "EUR", brandIds: [brandId], effectiveFrom: "2026-01-01", effectiveTo: null, idempotencyKey }) }));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_proposal_approval_policy_v2", expect.objectContaining({ p_mode: "threshold", p_brand_ids: [brandId], p_idempotency_key: idempotencyKey }));
  });

  it("maps overlapping effective policies to a conflict", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "PROPOSAL_POLICY_OVERLAP" } });
    const { POST } = await import("@/app/api/v2/admin/proposal-policies/route");
    const response = await POST(new Request("http://localhost/api/v2/admin/proposal-policies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Trùng lịch", mode: "fixed_two_level", thresholdAmount: null, currencyCode: "EUR", brandIds: [brandId], effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", idempotencyKey }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "PROPOSAL_POLICY_OVERLAP" } });
  });
});
