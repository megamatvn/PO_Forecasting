import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAccess = vi.fn();
const loadPlanningWorkspace = vi.fn();
const exportPlanWorkbook = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock("@/features/auth/server/get-current-access", () => ({ getCurrentAccess }));
vi.mock("@/features/planning/server/load-planning-workspace", () => ({ loadPlanningWorkspace }));
vi.mock("@/features/reports/server/export-plan", () => ({ exportPlanWorkbook }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

const versionId = "41000000-0000-0000-0000-000000000001";

describe("canonical plan export route", () => {
  beforeEach(() => {
    vi.resetModules();
    getCurrentAccess.mockReset();
    loadPlanningWorkspace.mockReset();
    exportPlanWorkbook.mockReset();
    createServerSupabaseClient.mockReset();
  });

  it("returns a private xlsx for an accessible version", async () => {
    const access = { displayName: "Planner", roles: ["planner"], brands: [], activeBrandId: null };
    const plan = {
      cycle: { code: "ETX-2026" },
      version: { id: versionId, versionNumber: 4 },
    };
    getCurrentAccess.mockResolvedValue(access);
    loadPlanningWorkspace.mockResolvedValue(plan);
    exportPlanWorkbook.mockResolvedValue(new Uint8Array([80, 75]).buffer);
    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { planning_cycle_id: "cycle-etx" },
              error: null,
            }),
          }),
        }),
      }),
    });
    const { GET } = await import("@/app/api/reports/export/route");

    const response = await GET(
      new Request(`http://localhost/api/reports/export?versionId=${versionId}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("ETX-2026-v4.xlsx");
    expect(loadPlanningWorkspace).toHaveBeenCalledWith("cycle-etx", access, versionId);
  });
});
