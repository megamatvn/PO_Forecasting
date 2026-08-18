import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn(); const rpc = vi.fn(); const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
describe("notification read route", () => {
  beforeEach(() => { vi.resetModules(); getUser.mockReset().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } }); rpc.mockReset().mockResolvedValue({ data: true, error: null }); createServerSupabaseClient.mockReset().mockResolvedValue({ auth: { getUser }, rpc }); });
  it("marks a notification read through recipient-scoped RPC", async () => {
    const id = "90000000-0000-4000-8000-000000000002"; const { POST } = await import("@/app/api/v2/notifications/[notificationId]/read/route");
    const response = await POST(new Request(`http://localhost/api/v2/notifications/${id}/read`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationId: id }) }), { params: Promise.resolve({ notificationId: id }) });
    expect(response.status).toBe(200); expect(rpc).toHaveBeenCalledWith("mark_notification_read_v2", { p_notification_id: id });
  });
  it("rejects a mismatched body id before database mutation", async () => {
    const id = "90000000-0000-4000-8000-000000000002"; const { POST } = await import("@/app/api/v2/notifications/[notificationId]/read/route");
    const response = await POST(new Request(`http://localhost/api/v2/notifications/${id}/read`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationId: "90000000-0000-4000-8000-000000000003" }) }), { params: Promise.resolve({ notificationId: id }) });
    expect(response.status).toBe(422); expect(rpc).not.toHaveBeenCalled();
  });
});
