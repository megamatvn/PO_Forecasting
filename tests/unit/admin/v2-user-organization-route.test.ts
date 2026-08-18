import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

describe("V2 organization route", () => {
  beforeEach(() => { vi.resetModules(); createServerSupabaseClient.mockReset(); });
  it("returns 403 for a non administrator", async () => {
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "1" } } }) }, rpc: vi.fn().mockResolvedValue({ data: false, error: null }) });
    const { POST } = await import("@/app/api/v2/admin/users/organization/route");
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });
  it("returns canonical DTO after an atomic save", async () => {
    const canonical = { id: "90000000-0000-4000-8000-000000000001", displayName: "Manager", isActive: true, tier: "manager", supervisorId: "90000000-0000-4000-8000-000000000002", capabilities: [], directBrands: [], inheritedBrands: [], subordinateCount: 0 };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { updated: true }, error: null })
      .mockResolvedValueOnce({ data: [{ id: canonical.id, display_name: canonical.displayName, is_active: true, tier: canonical.tier, supervisor_id: canonical.supervisorId, capabilities: [], direct_brands: [], inherited_brands: [], subordinate_count: 0 }], error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "1" } } }) }, rpc });
    const { POST } = await import("@/app/api/v2/admin/users/organization/route");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: canonical.id, tier: "manager", isActive: true, supervisorId: canonical.supervisorId, capabilities: [], brandIds: [], idempotencyKey: "81000000-0000-4000-8000-000000000001" }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject(canonical);
  });
});
