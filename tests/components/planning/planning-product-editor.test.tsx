import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanningProductEditor } from "@/features/planning/components/planning-product-editor";
import type { PlanningRowView } from "@/features/planning/planning-types";

const row: PlanningRowView = {
  planLineId: "line-1",
  productId: "product-1",
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
};

describe("PlanningProductEditor", () => {
  it("calculates the read-only amount from the Qty and Ex Price draft", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PlanningProductEditor
        row={{ ...row, exPrice: "4.20" }}
        canEdit
        currencyCode="EUR"
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("Thành tiền")).toHaveAttribute("readonly");
    await user.clear(screen.getByLabelText("Số lượng đặt"));
    await user.type(screen.getByLabelText("Số lượng đặt"), "10");

    expect(screen.getByLabelText("Thành tiền")).toHaveValue("42.00");
    expect(onChange).toHaveBeenLastCalledWith("line-1", { qty: 10 });
  });

  it("rejects negative and fractional quantities plus a negative Ex Price", async () => {
    const onChange = vi.fn();
    render(
      <PlanningProductEditor
        row={row}
        canEdit
        currencyCode="EUR"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Số lượng đặt"), {
      target: { value: "1.5" },
    });
    expect(screen.getByText("Số lượng đặt phải là số nguyên không âm.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Hàng tặng (FOC)"), {
      target: { value: "-1" },
    });
    expect(screen.getByText("Hàng tặng (FOC) phải là số nguyên không âm.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Đơn giá xuất xưởng"), {
      target: { value: "-4.2" },
    });
    expect(screen.getByText("Đơn giá xuất xưởng phải là số không âm.")).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("associates each validation message with its invalid control", () => {
    render(
      <PlanningProductEditor
        row={row}
        canEdit
        currencyCode="EUR"
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Số lượng đặt"), {
      target: { value: "1.5" },
    });
    fireEvent.change(screen.getByLabelText("Hàng tặng (FOC)"), {
      target: { value: "-1" },
    });
    fireEvent.change(screen.getByLabelText("Đơn giá xuất xưởng"), {
      target: { value: "-4.2" },
    });

    expect(screen.getByLabelText("Số lượng đặt")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Số lượng đặt")).toHaveAttribute(
      "aria-describedby",
      "planning-qty-error",
    );
    expect(screen.getByText("Số lượng đặt phải là số nguyên không âm.")).toHaveAttribute(
      "id",
      "planning-qty-error",
    );
    expect(screen.getByLabelText("Hàng tặng (FOC)")).toHaveAttribute(
      "aria-describedby",
      "planning-foc-error",
    );
    expect(screen.getByLabelText("Đơn giá xuất xưởng")).toHaveAttribute(
      "aria-describedby",
      "planning-price-error",
    );
  });

  it("rejects an Ex Price with more than six decimal places before it reaches autosave", () => {
    const onChange = vi.fn();
    render(
      <PlanningProductEditor
        row={row}
        canEdit
        currencyCode="EUR"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Đơn giá xuất xưởng"), {
      target: { value: "1.2345678" },
    });

    expect(
      screen.getByText("Đơn giá xuất xưởng chỉ được tối đa 6 chữ số thập phân."),
    ).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps proposal values readable when editing is disabled", () => {
    render(
      <PlanningProductEditor
        row={{ ...row, qty: 10, amount: "42.00" }}
        canEdit={false}
        currencyCode="EUR"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Số lượng đặt")).toBeDisabled();
    expect(screen.getByLabelText("Thành tiền")).toHaveValue("42.00");
    expect(screen.getByText("Đang xem đề xuất đã lưu.")).toBeVisible();
  });

  it("formats integer quantities when resting and exposes raw digits while editing", async () => {
    const user = userEvent.setup();
    render(
      <PlanningProductEditor
        row={{ ...row, qty: 681_466 }}
        canEdit
        currencyCode="EUR"
        onChange={vi.fn()}
      />,
    );

    const qty = screen.getByLabelText("Số lượng đặt");
    expect(qty).toHaveValue("681.466");
    await user.click(qty);
    expect(qty).toHaveValue("681466");
    await user.tab();
    expect(qty).toHaveValue("681.466");
  });
});
