import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanningWorkspace } from "@/features/planning/components/planning-workspace";
import { PlanVersionConflictError } from "@/features/planning/hooks/use-draft-autosave";

const plan = {
  brand: {
    code: "ETX",
  },
  cycle: {
    id: "40000000-0000-0000-0000-000000000001",
    code: "ETX-2026",
    name: "ETX Forecast 2026",
    planningYear: 2026,
    currencyCode: "EUR",
    targetPurchaseAmount: "100000.00",
  },
  version: {
    id: "41000000-0000-0000-0000-000000000001",
    versionNumber: 1,
    status: "draft" as const,
    lockVersion: 0,
    updatedAt: "2026-08-11T08:30:00.000Z",
  },
  canEdit: true,
  rows: [
    {
      planLineId: "42000000-0000-0000-0000-000000000001",
      productId: "20000000-0000-0000-0000-000000000150",
      sku: "ET-015150",
      productName: "ET-015150",
      openingStock: 32,
      targetStock: 0,
      annualDemand: 2400,
      qty: 0,
      focQty: 0,
      exPrice: "2.71",
      amount: "0.00",
      projectedStock: -2368,
      recommendedQty: 2368,
      severity: "critical" as const,
    },
  ],
};

describe("Planning autosave conflict", () => {
  it("opens a conflict dialog without replacing the local proposal", async () => {
    const saveDraft = vi.fn().mockRejectedValue(
      new PlanVersionConflictError({
        remoteLockVersion: 1,
        message: "Kế hoạch đã được cập nhật bởi Nguyễn An.",
      }),
    );
    const user = userEvent.setup();
    render(
      <PlanningWorkspace
        initialPlan={plan}
        saveDraft={saveDraft}
        autosaveDelayMs={0}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Điền đề xuất" }));

    expect(await screen.findByRole("dialog", { name: "Xung đột phiên bản" })).toBeVisible();
    expect(screen.getByText("Có xung đột")).toBeVisible();
    expect(screen.getByText("Kế hoạch đã được cập nhật bởi Nguyễn An.")).toBeVisible();
    expect(screen.getByLabelText("Số lượng đặt")).toHaveValue("2.368");
    expect(saveDraft).toHaveBeenCalledOnce();
  });

  it("traps focus, closes with Escape and returns focus to the local editor", async () => {
    const saveDraft = vi.fn().mockRejectedValue(
      new PlanVersionConflictError({
        remoteLockVersion: 1,
        message: "Kế hoạch đã được cập nhật bởi Nguyễn An.",
      }),
    );
    const user = userEvent.setup();
    render(
      <PlanningWorkspace
        initialPlan={plan}
        saveDraft={saveDraft}
        autosaveDelayMs={0}
      />,
    );

    const qty = screen.getByLabelText("Số lượng đặt");
    await user.click(screen.getByRole("button", { name: "Điền đề xuất" }));
    const dialog = await screen.findByRole("dialog", { name: "Xung đột phiên bản" });
    const keepLocal = within(dialog).getByRole("button", { name: "Giữ bản local" });
    const reload = within(dialog).getByRole("button", { name: "Tải phiên bản mới" });

    expect(keepLocal).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(reload).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(keepLocal).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Xung đột phiên bản" })).not.toBeInTheDocument();
    expect(qty).toHaveFocus();
  });
});
