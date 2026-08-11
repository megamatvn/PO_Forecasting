import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanningWorkspace } from "@/features/planning/components/planning-workspace";
import { PlanVersionConflictError } from "@/features/planning/hooks/use-draft-autosave";

const plan = {
  cycle: {
    id: "40000000-0000-0000-0000-000000000001",
    code: "ETX-2026",
    name: "ETX Forecast 2026",
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

    await user.click(
      screen.getByRole("button", { name: "Tạo PO đề xuất 2.368" }),
    );

    expect(await screen.findByRole("dialog", { name: "Xung đột phiên bản" })).toBeVisible();
    expect(screen.getByText("Kế hoạch đã được cập nhật bởi Nguyễn An.")).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Qty ET-015150" })).toHaveValue(
      2368,
    );
    expect(saveDraft).toHaveBeenCalledOnce();
  });
});
