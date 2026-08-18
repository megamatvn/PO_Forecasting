import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PurchaseWaveStep } from "@/features/annual-plans/components/purchase-wave-step";

const line = { productId: "90000000-0000-4000-8000-000000000101", canonicalSku: "ET-015025", productName: "Đặc trị xanh", exPrice: "1.75", annualPaidQty: 10, annualFocQty: 2, openingStock: 0 };

describe("PurchaseWaveStep", () => {
  it("adds waves and keeps the SKU column visible with Qty/FOC summaries", async () => {
    const user = userEvent.setup();
    render(<PurchaseWaveStep planningYear={2026} lines={[line]} />);
    expect(screen.getAllByText("ET-015025")[0]).toBeVisible();
    expect(screen.getByText(/Đã phân bổ/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Thêm đợt mua" }));
    expect(screen.getAllByRole("heading", { name: /PO #/ })).toHaveLength(2);
  });

  it("blocks under-allocation and reports the Qty/FOC mismatch", async () => {
    const user = userEvent.setup();
    render(<PurchaseWaveStep planningYear={2026} lines={[line]} />);
    await user.clear(screen.getByLabelText("Qty ET-015025 PO 1"));
    await user.type(screen.getByLabelText("Qty ET-015025 PO 1"), "9");
    expect(screen.getByRole("alert")).toHaveTextContent("Tổng số lượng phân bổ");
    expect(screen.getByRole("button", { name: "Lưu phân bổ" })).toBeDisabled();
  });
});
