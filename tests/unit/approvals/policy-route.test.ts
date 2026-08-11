import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

describe("approval policy route", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset();
  });

  it("creates one policy for multiple brands through an atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "72000000-0000-0000-0000-000000000001",
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) },
      rpc,
    });
    const { POST } = await import("@/app/api/admin/approval-policies/route");
    const body = {
      name: "ETX threshold 2027",
      mode: "threshold",
      thresholdAmount: "50000",
      currencyCode: "EUR",
      brandIds: [
        "10000000-0000-0000-0000-000000000001",
        "10000000-0000-0000-0000-000000000002",
      ],
      escalationFlags: ["criticalShortage"],
      effectiveFrom: "2027-01-01",
      effectiveTo: null,
    };

    const response = await POST(
      new Request("http://localhost/api/admin/approval-policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_approval_policy", {
      p_name: body.name,
      p_mode: body.mode,
      p_threshold_amount: body.thresholdAmount,
      p_currency_code: body.currencyCode,
      p_brand_ids: body.brandIds,
      p_escalation_flags: body.escalationFlags,
      p_effective_from: body.effectiveFrom,
      p_effective_to: null,
    });
  });
});
