import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createForecastWorkbookFixture } from "../../fixtures/forecast-workbook";

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
    rpc: vi.fn((name: string, args?: Record<string, unknown>) => {
      if (name === "can_administer_brand") {
        return Promise.resolve({ data: canAdminister, error: null });
      }

      if (name === "stage_import_batch") {
        return stageBatch(args);
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

async function makeRequest(options: {
  bytes?: Buffer;
  sourceSheetName?: string;
} = {}): Promise<Request> {
  const bytes = options.bytes ?? await readFile(fixturePath);
  const formData = new FormData();
  formData.set(
    "brandId",
    "10000000-0000-0000-0000-000000000001",
  );
  if (options.sourceSheetName) formData.set("sourceSheetName", options.sourceSheetName);
  formData.set(
    "file",
    new File([Uint8Array.from(bytes)], "forecast-import.synthetic.xlsx", {
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
      sourceSheetName: "Forecast 5M",
    });
    expect(body.rows.map((row: { canonicalSku: string }) => row.canonicalSku)).toEqual([
      "ET-015025",
      "ET-015150",
    ]);
    expect(upload).toHaveBeenCalledOnce();
    expect(stageBatch).toHaveBeenCalledOnce();
    expect(stageBatch.mock.calls[0][0]).toMatchObject({
      p_source_sheet_name: "Forecast 5M",
    });
  });

  it("rejects a user who cannot administer the selected brand", async () => {
    const { client, upload } = makeClient({ canAdminister: false });
    createServerSupabaseClient.mockResolvedValue(client);
    const { POST } = await import("@/app/api/imports/preview/route");

    const response = await POST(await makeRequest());

    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it("returns selectable candidates without staging when the workbook has multiple plan sheets", async () => {
    const { client, upload, stageBatch } = makeClient();
    createServerSupabaseClient.mockResolvedValue(client);
    const { POST } = await import("@/app/api/imports/preview/route");

    const response = await POST(await makeRequest({
      bytes: await createForecastWorkbookFixture({
        forecastSheetName: "Kế hoạch ETX 2026",
        additionalForecastSheetNames: ["Kế hoạch ETX 2027"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "sheet_selection_required",
      candidates: expect.arrayContaining([
        expect.objectContaining({ sheetName: "Kế hoạch ETX 2026" }),
        expect.objectContaining({ sheetName: "Kế hoạch ETX 2027" }),
      ]),
    });
    expect(upload).not.toHaveBeenCalled();
    expect(stageBatch).not.toHaveBeenCalled();
  });

  it("uses a structurally valid explicit source sheet selection", async () => {
    const { client, upload, stageBatch } = makeClient();
    createServerSupabaseClient.mockResolvedValue(client);
    const { POST } = await import("@/app/api/imports/preview/route");

    const response = await POST(await makeRequest({
      bytes: await createForecastWorkbookFixture({
        forecastSheetName: "Kế hoạch ETX 2026",
        additionalForecastSheetNames: ["Kế hoạch ETX 2027"],
      }),
      sourceSheetName: "Kế hoạch ETX 2027",
    }));
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(201);
    expect(body.sourceSheetName).toBe("Kế hoạch ETX 2027");
    expect(upload).toHaveBeenCalledOnce();
    expect(stageBatch).toHaveBeenCalledWith(
      expect.objectContaining({ p_source_sheet_name: "Kế hoạch ETX 2027" }),
    );
  });

  it("returns diagnostics when an explicit source sheet is invalid", async () => {
    const { client, upload, stageBatch } = makeClient();
    createServerSupabaseClient.mockResolvedValue(client);
    const { POST } = await import("@/app/api/imports/preview/route");

    const response = await POST(
      await makeRequest({ sourceSheetName: "Không tồn tại" }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      code: "invalid_workbook",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ sheetName: "Forecast 5M" }),
      ]),
    });
    expect(upload).not.toHaveBeenCalled();
    expect(stageBatch).not.toHaveBeenCalled();
  });
});
