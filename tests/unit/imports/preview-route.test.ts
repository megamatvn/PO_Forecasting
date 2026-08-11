import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

const fixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/forecast-import.synthetic.xlsx",
);

function makeClient({ canAdminister = true } = {}) {
  const upload = vi.fn().mockResolvedValue({ data: { path: "stored" }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const stageBatch = vi
    .fn()
    .mockResolvedValue({
      data: "50000000-0000-0000-0000-000000000099",
      error: null,
    });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "90000000-0000-0000-0000-000000000001" } },
        error: null,
      }),
    },
    rpc: vi.fn((name: string) => {
      if (name === "can_administer_brand") {
        return Promise.resolve({ data: canAdminister, error: null });
      }

      if (name === "stage_import_batch") {
        return stageBatch();
      }

      throw new Error(`Unexpected RPC ${name}`);
    }),
    from: vi.fn((table: string) => {
      if (table === "products") {
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "20000000-0000-0000-0000-000000000025",
                      canonical_sku: "ET-015025",
                    },
                    {
                      id: "20000000-0000-0000-0000-000000000150",
                      canonical_sku: "ET-015150",
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === "sku_aliases") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    alias_sku: "ET-015027",
                    product_id: "20000000-0000-0000-0000-000000000025",
                  },
                ],
                error: null,
              }),
          }),
        };
      }

      if (table === "import_batches") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    storage: {
      from: () => ({ upload, remove }),
    },
  };

  return { client, upload, stageBatch };
}

async function makeRequest(): Promise<Request> {
  const bytes = await readFile(fixturePath);
  const formData = new FormData();
  formData.set(
    "brandId",
    "10000000-0000-0000-0000-000000000001",
  );
  formData.set(
    "file",
    new File([bytes], "forecast-import.synthetic.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );

  return {
    formData: async () => formData,
  } as Request;
}

describe("POST /api/imports/preview", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerSupabaseClient.mockReset();
  });

  it("stages an authorized canonical preview and uploads its source file", async () => {
    const { client, upload, stageBatch } = makeClient();
    createServerSupabaseClient.mockResolvedValue(client);
    const { POST } = await import("@/app/api/imports/preview/route");

    const response = await POST(await makeRequest());
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(201);
    expect(body).toMatchObject({
      batchId: "50000000-0000-0000-0000-000000000099",
      canCommit: true,
    });
    expect(body.rows.map((row: { canonicalSku: string }) => row.canonicalSku)).toEqual([
      "ET-015025",
      "ET-015150",
    ]);
    expect(upload).toHaveBeenCalledOnce();
    expect(stageBatch).toHaveBeenCalledOnce();
  });

  it("rejects a user who cannot administer the selected brand", async () => {
    const { client, upload } = makeClient({ canAdminister: false });
    createServerSupabaseClient.mockResolvedValue(client);
    const { POST } = await import("@/app/api/imports/preview/route");

    const response = await POST(await makeRequest());

    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });
});
