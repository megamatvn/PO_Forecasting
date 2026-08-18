import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAccess = vi.fn();
const loadPlanningWorkspace = vi.fn();
const loadDashboard = vi.fn();

vi.mock("@/features/auth/server/get-current-access", () => ({ getCurrentAccess }));
vi.mock("@/features/planning/server/load-planning-workspace", () => ({ loadPlanningWorkspace }));
vi.mock("@/features/reports/server/load-dashboard", () => ({ loadDashboard }));
vi.mock("@/features/planning/components/planning-workspace", () => ({
  PlanningWorkspace: ({ poBatches, initialSelectedPlanLineId }: {
    poBatches?: Array<{ name: string }>;
    initialSelectedPlanLineId?: string | null;
  }) => (
    <div>
      {poBatches?.map((batch) => <span key={batch.name}>{batch.name}</span>)}
      <span data-testid="requested-line">{initialSelectedPlanLineId ?? "none"}</span>
    </div>
  ),
}));

const access = {
  displayName: "Planner",
  roles: ["planner"],
  brands: [{ id: "brand-etx", code: "ETX", name: "Etiaxil" }],
  activeBrandId: "brand-etx",
};

const plan = {
  brand: { code: "ETX" },
  cycle: {
    id: "cycle-etx",
    code: "ETX-2026",
    name: "Kế hoạch ETX 2026",
    planningYear: 2026,
    currencyCode: "EUR",
    targetPurchaseAmount: "100000",
  },
  version: {
    id: "version-7",
    versionNumber: 7,
    status: "draft" as const,
    lockVersion: 0,
    updatedAt: "2026-08-12T00:00:00.000Z",
  },
  canEdit: true,
  rows: [
    { planLineId: "line-authorized", sku: "ET-015025" },
  ],
};

describe("PlanningPage workflow data", () => {
  beforeEach(() => {
    vi.resetModules();
    getCurrentAccess.mockReset().mockResolvedValue(access);
    loadPlanningWorkspace.mockReset().mockResolvedValue(plan);
    loadDashboard.mockReset().mockResolvedValue({
      batches: [{ name: "PO tháng 9" }],
    });
  });

  it("loads PO/ETA batches for the selected authorized cycle and version", async () => {
    const { default: PlanningPage } = await import("@/app/(app)/planning/[cycleId]/page");

    render(
      await PlanningPage({
        params: Promise.resolve({ cycleId: "cycle-etx" }),
        searchParams: Promise.resolve({
          brandId: "brand-etx",
          versionId: "version-7",
          step: "po",
        }),
      }),
    );

    expect(loadPlanningWorkspace).toHaveBeenCalledWith(
      "cycle-etx",
      access,
      "version-7",
      "brand-etx",
    );
    expect(loadDashboard).toHaveBeenCalledWith("cycle-etx", access, {
      versionId: "version-7",
      brandId: "brand-etx",
    });
    expect(screen.getByText("PO tháng 9")).toBeVisible();
  });

  it("passes only a visible requested product to the workspace", async () => {
    const { default: PlanningPage } = await import("@/app/(app)/planning/[cycleId]/page");

    const rendered = render(
      await PlanningPage({
        params: Promise.resolve({ cycleId: "cycle-etx" }),
        searchParams: Promise.resolve({ brandId: "brand-etx", lineId: "line-authorized" }),
      }),
    );
    expect(screen.getByTestId("requested-line")).toHaveTextContent("line-authorized");

    rendered.unmount();
    render(
      await PlanningPage({
        params: Promise.resolve({ cycleId: "cycle-etx" }),
        searchParams: Promise.resolve({ brandId: "brand-etx", lineId: "line-outside-scope" }),
      }),
    );
    expect(screen.getByTestId("requested-line")).toHaveTextContent("none");
  });
});
