import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAccess = vi.fn();
const createServerSupabaseClient = vi.fn();
const loadDashboard = vi.fn();

vi.mock("@/features/auth/server/get-current-access", () => ({ getCurrentAccess }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/features/reports/server/load-dashboard", () => ({ loadDashboard }));

const access = {
  displayName: "Planner",
  roles: ["planner"],
  brands: [{ id: "brand-etx", code: "ETX", name: "ETX" }],
  activeBrandId: "brand-etx",
};

const cycle = {
  id: "cycle-etx",
  code: "ETX-2026",
  name: "Kế hoạch ETX 2026",
  planning_year: 2026,
  currency_code: "EUR",
  target_purchase_amount: "100000",
};

function cyclesClient() {
  const order = vi.fn().mockResolvedValue({ data: [cycle] });
  const eqActive = vi.fn().mockReturnValue({ order });
  const eqBrand = vi.fn().mockReturnValue({ eq: eqActive });
  const select = vi.fn().mockReturnValue({ eq: eqBrand });
  return { from: vi.fn().mockReturnValue({ select }) };
}

describe("PlanningIndexPage", () => {
  beforeEach(() => {
    vi.resetModules();
    getCurrentAccess.mockReset().mockResolvedValue(access);
    createServerSupabaseClient.mockReset().mockResolvedValue(cyclesClient());
    loadDashboard.mockReset();
  });

  it("renders the PO and ETA timeline for the selected authorized cycle", async () => {
    loadDashboard.mockResolvedValue({
      plan: { cycle: { currencyCode: "EUR" } },
      batches: [],
    });
    const { default: PlanningIndexPage } = await import("@/app/(app)/planning/page");

    render(
      await PlanningIndexPage({
        searchParams: Promise.resolve({ brandId: "brand-etx", step: "po" }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1, name: "Đợt mua & ngày hàng về" })).toBeVisible();
    expect(screen.getByText("Chưa có đợt PO phù hợp bộ lọc.")).toBeVisible();
    expect(loadDashboard).toHaveBeenCalledWith(cycle.id, access);
  });

  it("keeps the cycle list on the standard planning route", async () => {
    const { default: PlanningIndexPage } = await import("@/app/(app)/planning/page");

    render(await PlanningIndexPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: /ETX-2026/ })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Đợt mua & ngày hàng về" })).toBeNull();
  });
});
