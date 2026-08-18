import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

describe("V2 create account route", () => {
  beforeEach(() => { vi.resetModules(); createServerSupabaseClient.mockReset(); createClient.mockReset(); process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; });
  it("normalizes prefix and never returns the initial password", async () => {
    const adminCreateUser = vi.fn().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } }, error: null });
    const adminUpsert = vi.fn().mockResolvedValue({ error: null });
    createClient.mockReturnValue({ auth: { admin: { createUser: adminCreateUser, deleteUser: vi.fn() } }, from: vi.fn(() => ({ upsert: adminUpsert })) });
    const rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: { updated: true }, error: null }).mockResolvedValueOnce({ data: [{ id: "90000000-0000-4000-8000-000000000001", display_name: "Người dùng", is_active: true, tier: "employee_viewer", supervisor_id: null, capabilities: [], direct_brands: [], inherited_brands: [], subordinate_count: 0 }], error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin" } } }) }, rpc, from: vi.fn(() => ({ upsert })) });
    const { POST } = await import("@/app/api/v2/admin/users/route");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emailPrefix: "New.User", displayName: "Người dùng", password: "Sagen@123456", tier: "employee_viewer", supervisorId: null, capabilities: [], brandIds: [], idempotencyKey: "81000000-0000-4000-8000-000000000001" }) }));
    expect(response.status).toBe(201);
    expect(adminCreateUser).toHaveBeenCalledWith(expect.objectContaining({ email: "new.user@sagen-groupe.com", password: "Sagen@123456" }));
    expect(adminUpsert).toHaveBeenCalledWith({ id: "90000000-0000-4000-8000-000000000001", display_name: "Người dùng", is_active: true }, { onConflict: "id" });
    expect(JSON.stringify(await response.json())).not.toContain("Sagen@123456");
  });
});
