import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

function request(body: unknown) {
  return new Request("http://localhost/api/v2/annual-plans/90000000-0000-4000-8000-000000000302/waves", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const base = { lockVersion: 0, idempotencyKey: "90000000-0000-4000-8000-000000000202", waves: [{ id: "client-wave-1", sequence: 1, orderMonth: "2026-03", arrivalMonth: "2026-04", allocations: [{ productId: "90000000-0000-4000-8000-000000000101", paidQty: 10, focQty: 2, exPrice: "1.75" }] }] };

describe("purchase wave route", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } });
    rpc.mockReset();
    createServerSupabaseClient.mockReset().mockResolvedValue({ auth: { getUser }, rpc });
  });

  it("normalizes client wave IDs/months and calls the atomic V2 command", async () => {
    rpc.mockResolvedValue({ data: { revisionId: "90000000-0000-4000-8000-000000000302", lockVersion: 1, waves: [{ id: "90000000-0000-4000-8000-000000000401", sequence: 1, orderMonth: "2026-05", arrivalMonth: "2026-06", allocations: [] }] }, error: null });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/waves/route");
    const response = await POST(request(base), { params: Promise.resolve({ revisionId: "90000000-0000-4000-8000-000000000302" }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("save_purchase_wave_allocations_v2", expect.objectContaining({ p_revision_id: "90000000-0000-4000-8000-000000000302", p_expected_lock_version: 0, p_idempotency_key: base.idempotencyKey }));
    expect(rpc.mock.calls[0][1].p_waves[0]).toEqual(expect.objectContaining({ waveId: null, waveNumber: 1, orderMonth: "2026-03-01", arrivalMonth: "2026-04-01" }));
    expect(await response.json()).toMatchObject({ ok: true, data: { lockVersion: 1, waves: [{ orderMonth: "2026-05", arrivalMonth: "2026-06" }] } });
  });

  it("rejects duplicate sequence and duplicate SKU allocations before the database", async () => {
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/waves/route");
    const response = await POST(request({ ...base, waves: [{ ...base.waves[0], sequence: 1, allocations: [...base.waves[0].allocations, base.waves[0].allocations[0]] }, { ...base.waves[0], id: "client-wave-2" }] }), { params: Promise.resolve({ revisionId: "90000000-0000-4000-8000-000000000302" }) });
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps allocation mismatch to a blocking 422", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "PURCHASE_WAVE_ALLOCATION_MISMATCH" } });
    const { POST } = await import("@/app/api/v2/annual-plans/[revisionId]/waves/route");
    const response = await POST(request(base), { params: Promise.resolve({ revisionId: "90000000-0000-4000-8000-000000000302" }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "PURCHASE_WAVE_ALLOCATION_MISMATCH" } });
  });
});
