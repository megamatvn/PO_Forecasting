import { afterEach, describe, expect, it, vi } from "vitest";
import { httpImportTransport } from "@/features/imports/hooks/use-import-workflow";

describe("httpImportTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the selected workbook and brand to the preview endpoint", async () => {
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
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/imports/preview");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    expect((init.body as FormData).get("brandId")).toBe(
      "10000000-0000-0000-0000-000000000001",
    );
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
});
