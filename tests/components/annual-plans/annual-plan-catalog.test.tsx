import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnnualPlanCatalog, type AnnualPlanCatalogDTO } from "@/features/annual-plans/components/annual-plan-catalog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const catalog: AnnualPlanCatalogDTO = {
  myDrafts: [{ revisionId: "90000000-0000-4000-8000-000000000301", cycleId: "90000000-0000-4000-8000-000000000201", brandId: "90000000-0000-4000-8000-000000000101", brandCode: "ET", brandName: "Etiaxil", planningYear: 2026, revisionNumber: 1, status: "draft_owner_only", updatedAt: "2026-08-01T00:00:00.000Z", submittedAt: null, approvedAt: null }],
  myPending: [{ revisionId: "90000000-0000-4000-8000-000000000302", cycleId: "90000000-0000-4000-8000-000000000201", brandId: "90000000-0000-4000-8000-000000000101", brandCode: "ET", brandName: "Etiaxil", planningYear: 2026, revisionNumber: 2, status: "pending_executive", updatedAt: "2026-08-02T00:00:00.000Z", submittedAt: "2026-08-03T00:00:00.000Z", approvedAt: null }],
  approvedBaselines: [{ revisionId: "90000000-0000-4000-8000-000000000304", cycleId: "90000000-0000-4000-8000-000000000201", brandId: "90000000-0000-4000-8000-000000000101", brandCode: "ET", brandName: "Etiaxil", planningYear: 2026, revisionNumber: 2, status: "approved", updatedAt: "2026-08-04T00:00:00.000Z", submittedAt: "2026-08-03T00:00:00.000Z", approvedAt: "2026-08-04T00:00:00.000Z" }],
  revisionHistory: [{ revisionId: "90000000-0000-4000-8000-000000000303", cycleId: "90000000-0000-4000-8000-000000000201", brandId: "90000000-0000-4000-8000-000000000101", brandCode: "ET", brandName: "Etiaxil", planningYear: 2026, revisionNumber: 1, status: "superseded", updatedAt: "2026-07-01T00:00:00.000Z", submittedAt: "2026-07-02T00:00:00.000Z", approvedAt: "2026-07-03T00:00:00.000Z" }],
  draftConflicts: [{ brandId: "90000000-0000-4000-8000-000000000101", brandCode: "ET", brandName: "Etiaxil", planningYear: 2027 }],
  brands: [{ id: "90000000-0000-4000-8000-000000000101", code: "ET", name: "Etiaxil", isActive: true }],
  currentYear: 2026,
  planningYears: [2026, 2027, 2200],
  maxPlanningYear: 2200,
  canCreatePlan: true,
};

describe("AnnualPlanCatalog", () => {
  it("organizes work by status and offers owner-only resume plus approved revision", () => {
    render(<AnnualPlanCatalog catalog={catalog} />);

    expect(screen.getByRole("heading", { name: "Kế hoạch của tôi" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Tiếp tục bản nháp" })).toHaveAttribute("href", expect.stringContaining("/annual-plans/90000000-0000-4000-8000-000000000301?step=scope"));
    expect(screen.getByText("Chờ CEO/BOD phê duyệt")).toBeVisible();
    expect(screen.getByRole("button", { name: "Tạo phiên bản điều chỉnh" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Xem phiên bản 1" })).toHaveAttribute("href", expect.stringContaining("/annual-plans/90000000-0000-4000-8000-000000000303"));
  });

  it("does not expose another owner's name or draft contents", () => {
    render(<AnnualPlanCatalog catalog={catalog} />);
    expect(screen.getByText(/Đang có bản nháp riêng tư của người lập khác/)).toBeVisible();
    expect(screen.queryByText(/owner|Nguyễn|dòng SKU/i)).not.toBeInTheDocument();
  });

  it("lets the user choose a far-future year before starting a plan", () => {
    render(<AnnualPlanCatalog catalog={catalog} />);
    const year = screen.getByLabelText("Năm kế hoạch mới");
    expect(year).toHaveAttribute("min", "2026");
    expect(year).toHaveAttribute("max", "2200");
    expect(screen.getByRole("button", { name: "Tạo kế hoạch mới" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tạo kế hoạch mới" }).closest("form")).toHaveAttribute("action", "/annual-plans/new");
  });

  it("keeps an approved baseline view-only when the account cannot create plans", () => {
    render(<AnnualPlanCatalog catalog={{ ...catalog, canCreatePlan: false }} />);
    expect(screen.getByRole("link", { name: "Xem kế hoạch" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Tạo phiên bản điều chỉnh" })).not.toBeInTheDocument();
  });
});
