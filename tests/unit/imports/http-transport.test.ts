import { afterEach, describe, expect, it, vi } from "vitest";
import { httpImportTransport } from "@/features/imports/hooks/use-import-workflow";

describe("httpImportTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an optional selected source sheet with the workbook and brand", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          batchId: "50000000-0000-0000-0000-000000000001",
          checksum: "checksum",
          canCommit: true,
          rows: [],
          issues: [],
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["workbook"], "forecast.xlsx");

    await httpImportTransport.preview(
      file,
      "10000000-0000-0000-0000-000000000001",
      "Kế hoạch ETX 2026",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/imports/preview");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    expect((init.body as FormData).get("brandId")).toBe(
      "10000000-0000-0000-0000-000000000001",
    );
    expect((init.body as FormData).get("sourceSheetName")).toBe("Kế hoạch ETX 2026");
  });

  it("sends retry-safe commit metadata as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          snapshotId: "60000000-0000-0000-0000-000000000001",
          committedAt: "2026-08-11T08:30:00.000Z",
          affectedDraftCount: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await httpImportTransport.commit({
      batchId: "50000000-0000-0000-0000-000000000001",
      idempotencyKey: "51000000-0000-0000-0000-000000000001",
      warningsConfirmed: true,
    });

    expect(result.affectedDraftCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/imports/commit",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          batchId: "50000000-0000-0000-0000-000000000001",
          idempotencyKey: "51000000-0000-0000-0000-000000000001",
          warningsConfirmed: true,
        }),
      }),
    );
  });

  it("preserves candidate diagnostics for the sheet picker", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "sheet_selection_required",
          message: "Có nhiều sheet kế hoạch phù hợp.",
          candidates: [
            {
              sheetName: "Kế hoạch ETX 2026",
              headerRow: 5,
              score: 7,
              missingHeaders: [],
            },
          ],
          correlationId: "corr-1",
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      httpImportTransport.preview(
        new File(["workbook"], "forecast.xlsx"),
        "10000000-0000-0000-0000-000000000001",
      ),
    ).rejects.toMatchObject({
      code: "sheet_selection_required",
      candidates: [expect.objectContaining({ sheetName: "Kế hoạch ETX 2026" })],
      correlationId: "corr-1",
    });
  });
});
