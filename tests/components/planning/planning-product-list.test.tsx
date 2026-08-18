import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PlanningProductList } from "@/features/planning/components/planning-product-list";
import type { PlanningRowView } from "@/features/planning/planning-types";

const rows: PlanningRowView[] = [
  {
    planLineId: "critical-line",
    productId: "critical-product",
    sku: "ET-015025",
    productName: "Đặc trị xanh",
    openingStock: 319_321,
    targetStock: 0,
    annualDemand: 1_000_787,
    qty: 0,
    focQty: 0,
    exPrice: "4.20",
    amount: "0.00",
    projectedStock: -681_466,
    recommendedQty: 681_466,
    severity: "critical",
  },
  {
    planLineId: "warning-line",
    productId: "warning-product",
    sku: "ET-015073",
    productName: "Xịt 100ml xanh dương",
    openingStock: 1_790,
    targetStock: 0,
    annualDemand: 12_301,
    qty: 0,
    focQty: 0,
    exPrice: "1.70",
    amount: "0.00",
    projectedStock: -10_511,
    recommendedQty: 10_511,
    severity: "warning",
  },
  {
    planLineId: "healthy-line",
    productId: "healthy-product",
    sku: "ET-015150",
    productName: "Sản phẩm đủ tồn",
    openingStock: 3_000,
    targetStock: 0,
    annualDemand: 2_400,
    qty: 0,
    focQty: 0,
    exPrice: "2.71",
    amount: "0.00",
    projectedStock: 600,
    recommendedQty: 0,
    severity: "healthy",
  },
];

function ControlledProductList() {
  const [selectedPlanLineId, setSelectedPlanLineId] = useState("critical-line");

  return (
    <PlanningProductList
      rows={rows}
      selectedPlanLineId={selectedPlanLineId}
      onSelect={setSelectedPlanLineId}
    />
  );
}

describe("PlanningProductList", () => {
  it("selects products with the keyboard and exposes the current item", async () => {
    const user = userEvent.setup();
    render(<ControlledProductList />);

    const criticalRow = screen.getByRole("row", { name: /ET-015025/i });
    expect(criticalRow).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Đang xem")).toBeVisible();

    criticalRow.focus();
    await user.keyboard("{ArrowDown}");

    expect(
      screen.getByRole("row", { name: /ET-015073/i }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("row", { name: /ET-015073/i }),
    ).toHaveAttribute("tabindex", "0");
    expect(criticalRow).toHaveAttribute("tabindex", "-1");
  });

  it("keeps one roving tab stop and activates a row with Enter or Space", async () => {
    const user = userEvent.setup();
    render(<ControlledProductList />);

    const rowsBySku = {
      critical: screen.getByRole("row", { name: /ET-015025/i }),
      warning: screen.getByRole("row", { name: /ET-015073/i }),
      healthy: screen.getByRole("row", { name: /ET-015150/i }),
    };

    expect(rowsBySku.critical).toHaveAttribute("tabindex", "0");
    expect(rowsBySku.warning).toHaveAttribute("tabindex", "-1");
    expect(rowsBySku.healthy).toHaveAttribute("tabindex", "-1");

    rowsBySku.warning.focus();
    await user.keyboard(" ");
    expect(rowsBySku.warning).toHaveAttribute("aria-current", "true");
    expect(rowsBySku.warning).toHaveAttribute("tabindex", "0");
    expect(rowsBySku.critical).toHaveAttribute("tabindex", "-1");

    rowsBySku.healthy.focus();
    await user.keyboard("{Enter}");
    expect(rowsBySku.healthy).toHaveAttribute("aria-current", "true");
    expect(rowsBySku.healthy).toHaveAttribute("tabindex", "0");
    expect(rowsBySku.warning).toHaveAttribute("tabindex", "-1");
  });

  it("announces the result count and the empty filtered state", async () => {
    const user = userEvent.setup();
    render(<ControlledProductList />);

    expect(screen.getByText("Hiển thị 3 trên 3 sản phẩm.")).toBeVisible();

    await user.type(screen.getByRole("searchbox", { name: "Tìm SKU hoặc tên sản phẩm" }), "không có");

    expect(screen.getByText("Không có sản phẩm phù hợp với bộ lọc hiện tại.")).toBeVisible();
    expect(screen.getByText("Hiển thị 0 trên 3 sản phẩm.")).toBeVisible();
  });

  it("updates aria-sort and announces the selected sort order", async () => {
    const user = userEvent.setup();
    render(<ControlledProductList />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sắp xếp danh sách" }),
      "sku_asc",
    );

    expect(screen.getByRole("columnheader", { name: "SKU" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByText("Đang sắp xếp: SKU (A–Z).")) .toBeVisible();
  });
});
