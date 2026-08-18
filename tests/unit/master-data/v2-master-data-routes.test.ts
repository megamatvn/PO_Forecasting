import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const brandId = "90000000-0000-4000-8000-000000000101";
const productId = "90000000-0000-4000-8000-000000000102";
const idempotencyKey = "90000000-0000-4000-8000-000000000103";

describe("V2 master-data routes", () => {
  beforeEach(() => { vi.resetModules(); createServerSupabaseClient.mockReset(); });

  it("rejects brand creation without annual-plan capability", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } }) },
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    });
    const { POST } = await import("@/app/api/v2/master-data/brands/route");
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ code: "et", name: "Etiaxil", idempotencyKey }) }));
    expect(response.status).toBe(403);
  });

  it("normalizes a brand and returns the canonical DTO", async () => {
    const rpc = vi.fn().mockImplementation((name: string) => {
      if (name === "current_user_has_capability") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: { id: brandId, code: "ET", name: "Etiaxil", isActive: true, warning: null }, error: null });
    });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } }) }, rpc });
    const { POST } = await import("@/app/api/v2/master-data/brands/route");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: " et ", name: " Etiaxil ", idempotencyKey }) }));
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({ id: brandId, code: "ET", name: "Etiaxil", isActive: true });
  });

  it("requires brand authorization before creating a product", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } }) }, rpc });
    const { POST } = await import("@/app/api/v2/master-data/products/route");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, sku: "et-015025", name: "Đặc trị xanh", idempotencyKey }) }));
    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith("can_use_brand_capability", { p_brand_id: brandId, p_capability: "create_annual_plan" });
  });

  it("returns a prefix warning without rejecting a product", async () => {
    const rpc = vi.fn().mockImplementation((name: string) => {
      if (name === "can_use_brand_capability") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: { id: productId, brandId, canonicalSku: "ET-015025", name: "Đặc trị xanh", isActive: true, aliases: [], warning: "SKU không cùng tiền tố nhãn hàng." }, error: null });
    });
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } } }) }, rpc });
    const { POST } = await import("@/app/api/v2/master-data/products/route");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId, sku: "ZZ-015025", name: "Đặc trị xanh", idempotencyKey }) }));
    expect(response.status).toBe(201);
    expect((await response.json()).data.warning).toContain("tiền tố");
  });
});
