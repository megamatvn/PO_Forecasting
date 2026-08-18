import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnnualPlanWizard } from "@/features/annual-plans/components/annual-plan-wizard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const brandEt = {
  id: "90000000-0000-4000-8000-000000000101",
  code: "ET",
  name: "Etiaxil",
  isActive: true,
};

const brandOther = {
  id: "90000000-0000-4000-8000-000000000102",
  code: "OTHER",
  name: "Không được cấp quyền",
  isActive: true,
};

const baseProps = {
  initialStep: "scope" as const,
  brands: [brandEt],
  planningYears: [2026, 2027],
  currentYear: 2026,
  initialScope: { brandId: "", planningYear: 2026 },
  canCreateBrand: false,
};

describe("AnnualPlanWizard", () => {
  it("shows only current/future years and the authorized brands", () => {
    render(
      <AnnualPlanWizard
        {...baseProps}
        brands={[brandEt, brandOther]}
        authorizedBrandIds={[brandEt.id]}
        planningYears={[2025, 2026, 2027]}
      />,
    );

    const yearSelect = screen.getByLabelText("Năm kế hoạch");
    expect(screen.queryByRole("option", { name: "2025" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2026" })).toBeVisible();
    expect(screen.getByRole("option", { name: "2027" })).toBeVisible();
    expect(screen.getByRole("option", { name: /ET · Etiaxil/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /OTHER/ })).not.toBeInTheDocument();
    expect(yearSelect).toHaveValue("2026");
  });

  it("keeps Tiếp tục disabled until the scope is valid", async () => {
    const user = userEvent.setup();
    render(<AnnualPlanWizard {...baseProps} />);

    const next = screen.getByRole("button", { name: "Tiếp tục" });
    expect(next).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Nhãn hàng"), brandEt.id);
    expect(next).toBeEnabled();
  });

  it("adds a newly created brand to the selector and selects it", async () => {
    const user = userEvent.setup();
    const onCreateBrand = vi.fn().mockResolvedValue({
      id: "90000000-0000-4000-8000-000000000103",
      code: "NEW",
      name: "Nhãn mới",
      isActive: true,
    });
    render(
      <AnnualPlanWizard
        {...baseProps}
        canCreateBrand
        onCreateBrand={onCreateBrand}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Thêm nhãn hàng" }));
    expect(screen.getByRole("dialog", { name: "Thêm nhãn hàng" })).toBeVisible();
    await user.type(screen.getByLabelText("Mã nhãn hàng"), "new");
    await user.type(screen.getByLabelText("Tên nhãn hàng"), "Nhãn mới");
    await user.click(screen.getByRole("button", { name: "Lưu nhãn hàng" }));

    expect(onCreateBrand).toHaveBeenCalledWith({ code: "NEW", name: "Nhãn mới" });
    expect(await screen.findByRole("option", { name: /NEW · Nhãn mới/ })).toBeVisible();
    expect(screen.getByLabelText("Nhãn hàng")).toHaveValue("90000000-0000-4000-8000-000000000103");
  });

  it("keeps revision context in the step links and hides inaccessible future steps", () => {
    render(
      <AnnualPlanWizard
        {...baseProps}
        revisionId="90000000-0000-4000-8000-000000000104"
        allowedSteps={["scope"]}
        initialScope={{ brandId: brandEt.id, planningYear: 2026 }}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Các bước kế hoạch" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Phạm vi/ })).toHaveAttribute(
      "href",
      "/annual-plans/90000000-0000-4000-8000-000000000104?step=scope",
    );
    expect(screen.queryByRole("link", { name: /SKU/ })).not.toBeInTheDocument();
  });

  it("renders the SKU and PO steps instead of a placeholder after scope creation", () => {
    render(
      <AnnualPlanWizard
        {...baseProps}
        revisionId="90000000-0000-4000-8000-000000000105"
        initialStep="lines"
        initialScope={{ brandId: brandEt.id, planningYear: 2026 }}
        products={[{ id: "90000000-0000-4000-8000-000000000205", brandId: brandEt.id, canonicalSku: "ET-015025", name: "Đặc trị xanh", isActive: true, aliases: [] }]}
        allowedSteps={["scope", "lines", "waves", "review"]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Danh sách SKU của kế hoạch" })).toBeVisible();
    expect(screen.queryByText("Bước này sẽ mở sau khi phạm vi kế hoạch đã được lưu.")).not.toBeInTheDocument();
  });

  it("shows a completion screen after the owner submits instead of leaving the user on a fifth step", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    render(
      <AnnualPlanWizard
        {...baseProps}
        revisionId="90000000-0000-4000-8000-000000000106"
        initialStep="review"
        initialScope={{ brandId: brandEt.id, planningYear: 2026 }}
        allowedSteps={["scope", "lines", "waves", "review"]}
        reviewData={{
          revisionId: "90000000-0000-4000-8000-000000000106",
          ownerName: "Nguyễn Văn A",
          brand: { code: "ET", name: "Etiaxil" },
          planningYear: 2026,
          status: "draft_owner_only",
          role: "manager",
          assignedExecutiveName: "CEO Sagen",
          totals: { budget: "18.394 €", paidQty: "10.511", focQty: "0", skuCount: 2, waveCount: 2 },
          waves: [],
          errors: [],
          warnings: [],
        }}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Hoàn tất & gửi CEO/BOD duyệt" })[0]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hoàn tất & gửi CEO/BOD duyệt" }));
    expect(await screen.findByRole("heading", { name: "Kế hoạch đã được gửi phê duyệt" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Về danh mục kế hoạch" })).toHaveAttribute("href", "/annual-plans");
    expect(screen.queryByText("Bước này sẽ mở sau khi phạm vi kế hoạch đã được lưu.")).not.toBeInTheDocument();
  });
});
