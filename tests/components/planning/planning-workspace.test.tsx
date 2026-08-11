import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PlanningWorkspace } from "@/features/planning/components/planning-workspace";

const et015150Plan = {
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

describe("PlanningWorkspace", () => {
  it("keeps the ET-015150 shortage and PO proposal above the grid", () => {
    render(<PlanningWorkspace initialPlan={et015150Plan} />);

    expect(
      screen.getByText("ET-015150 dự kiến thiếu 2.368 sản phẩm"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Tạo PO đề xuất 2.368" }),
    ).toBeEnabled();
  });

  it("applies the recommendation and recalculates Amount from Qty × Ex Price", async () => {
    const user = userEvent.setup();
    render(<PlanningWorkspace initialPlan={et015150Plan} />);

    await user.click(
      screen.getByRole("button", { name: "Tạo PO đề xuất 2.368" }),
    );

    expect(screen.getByRole("spinbutton", { name: "Qty ET-015150" })).toHaveValue(
      2368,
    );
    expect(screen.getByText("6.417,28")).toBeVisible();
  });
});
