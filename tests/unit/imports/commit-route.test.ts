import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/imports/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/imports/commit", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset();
  });

  it("returns the committed snapshot for an authenticated request", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "90000000-0000-0000-0000-000000000001" } },
          error: null,
        }),
      },
      rpc: vi.fn().mockResolvedValue({
        data: "60000000-0000-0000-0000-000000000001",
        error: null,
      }),
    });
    const { POST } = await import("@/app/api/imports/commit/route");

    const response = await POST(
      makeRequest({
        batchId: "50000000-0000-0000-0000-000000000001",
        idempotencyKey: "51000000-0000-0000-0000-000000000001",
        warningsConfirmed: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      snapshotId: "60000000-0000-0000-0000-000000000001",
    });
  });

  it("returns a safe conflict when warnings were not confirmed", async () => {
    createServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "90000000-0000-0000-0000-000000000001" } },
          error: null,
        }),
      },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "import_warnings_require_confirmation" },
      }),
    });
    const { POST } = await import("@/app/api/imports/commit/route");

    const response = await POST(
      makeRequest({
        batchId: "50000000-0000-0000-0000-000000000001",
        idempotencyKey: "51000000-0000-0000-0000-000000000001",
        warningsConfirmed: false,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ code: "warnings_require_confirmation" });
    expect(JSON.stringify(body)).not.toContain("import_warnings_require_confirmation");
  });
});
