import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProposalForm } from "@/features/proposals/components/proposal-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const brandId = "90000000-0000-4000-8000-000000000101";
const products = [{ id: "90000000-0000-4000-8000-000000000201", canonicalSku: "ET-015025", name: "Đặc trị xanh" }];
const otherBrandId = "90000000-0000-4000-8000-000000000102";
const otherProducts = [{ id: "90000000-0000-4000-8000-000000000202", canonicalSku: "AB-000001", name: "Sản phẩm ABC" }];

describe("ProposalForm", () => {
  it("shows a simple quantity-only editor and validates the request reason", async () => {
    const user = userEvent.setup();
    render(<ProposalForm brands={[{ id: brandId, code: "ET", name: "Etiaxil" }]} products={products} currentYear={2026} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/Ex Price/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/FOC/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tạo đề xuất mua hàng" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Gửi đề xuất" }));
    expect(screen.getByText("Vui lòng nhập lý do đủ rõ ràng.")).toBeVisible();
  });

  it("supports multiple SKU rows without revealing baseline values", async () => {
    const user = userEvent.setup();
    render(<ProposalForm brands={[{ id: brandId, code: "ET", name: "Etiaxil" }]} products={products} currentYear={2026} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Thêm SKU" }));
    expect(screen.getAllByLabelText("SKU")).toHaveLength(2);
    expect(screen.getAllByLabelText("Số lượng đề xuất")).toHaveLength(2);
  });

  it("filters SKU options by the selected brand", async () => {
    const user = userEvent.setup();
    render(<ProposalForm brands={[{ id: brandId, code: "ET", name: "Etiaxil" }, { id: otherBrandId, code: "AB", name: "Brand ABC" }]} products={products} productsByBrand={{ [brandId]: products, [otherBrandId]: otherProducts }} currentYear={2026} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("SKU")).toHaveValue(products[0].id);
    await user.selectOptions(screen.getByLabelText("Nhãn hàng"), otherBrandId);
    expect(screen.getByLabelText("SKU")).toHaveValue(otherProducts[0].id);
    expect(screen.getByLabelText("SKU")).toHaveTextContent("AB-000001");
    expect(screen.getByLabelText("SKU")).not.toHaveTextContent("ET-015025");
  });
});
