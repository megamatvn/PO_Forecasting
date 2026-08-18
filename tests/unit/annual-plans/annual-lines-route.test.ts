import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

function request(body: unknown, revisionId = "90000000-0000-4000-8000-000000000302") {
  return new Request(`http://localhost/api/v2/annual-plans/${revisionId}/lines`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("annual plan lines route", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } });
    rpc.mockReset();
    createServerSupabaseClient.mockReset().mockResolvedValue({ auth: { getUser }, rpc });
  });

  it("rejects invalid rows before touching the database", async () => {
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/lines/route");
    const response = await POST(request({ lockVersion: 0, idempotencyKey: "90000000-0000-4000-8000-000000000202", lines: [] }), { params: Promise.resolve({ revisionId: "90000000-0000-4000-8000-000000000302" }) });
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps rows to the V2 command and returns server-calculated totals", async () => {
    rpc.mockResolvedValue({ data: { revisionId: "90000000-0000-4000-8000-000000000302", lockVersion: 1 }, error: null });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/lines/route");
    const response = await POST(request({ lockVersion: 0, idempotencyKey: "90000000-0000-4000-8000-000000000202", lines: [{ clientRowId: "row-1", productId: "90000000-0000-4000-8000-000000000101", exPrice: "1.75", paidQty: 10511, expectedFoc: 250, openingStock: 1790 }] }), { params: Promise.resolve({ revisionId: "90000000-0000-4000-8000-000000000302" }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("save_annual_plan_lines_v2", expect.objectContaining({ p_revision_id: "90000000-0000-4000-8000-000000000302", p_expected_lock_version: 0, p_idempotency_key: "90000000-0000-4000-8000-000000000202" }));
    expect(rpc.mock.calls[0][1].p_lines[0]).toEqual(expect.objectContaining({ annualPaidQty: 10511, annualFocQty: 250, amount: "18394.25", totalReceipts: 10761 }));
    expect(await response.json()).toMatchObject({ ok: true, data: { lockVersion: 1, lines: [{ amount: "18394.25", totalReceipts: 10761 }] } });
  });

  it("returns 409 and keeps the canonical conflict contract", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ANNUAL_PLAN_LOCK_CONFLICT" } });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/lines/route");
    const response = await POST(request({ lockVersion: 0, idempotencyKey: "90000000-0000-4000-8000-000000000202", lines: [{ productId: "90000000-0000-4000-8000-000000000101", exPrice: "1", paidQty: 1, expectedFoc: 0, openingStock: 0 }] }), { params: Promise.resolve({ revisionId: "90000000-0000-4000-8000-000000000302" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "ANNUAL_PLAN_LOCK_CONFLICT" } });
  });
});
