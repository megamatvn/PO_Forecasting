import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ProductOptionDTO } from "@/features/master-data/contracts";
import { AnnualLinesStep } from "@/features/annual-plans/components/annual-lines-step";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const brandId = "90000000-0000-4000-8000-000000000010";
const products: ProductOptionDTO[] = [
  { id: "90000000-0000-4000-8000-000000000101", brandId, canonicalSku: "ET-015025", name: "Đặc trị xanh có tên sản phẩm rất dài để kiểm tra tooltip", isActive: true, aliases: [] },
  { id: "90000000-0000-4000-8000-000000000102", brandId, canonicalSku: "ET-015026", name: "SKU đã ngừng", isActive: false, aliases: [] },
  { id: "90000000-0000-4000-8000-000000000201", brandId: "90000000-0000-4000-8000-000000000011", canonicalSku: "OTHER-1", name: "Nhãn khác", isActive: true, aliases: [] },
];

describe("AnnualLinesStep", () => {
  it("filters to active products of the selected brand and calculates totals", async () => {
    const user = userEvent.setup();
    render(<AnnualLinesStep brandId={brandId} products={products} />);
    expect(screen.getByText("ET-015025")).toBeVisible();
    expect(screen.queryByText("ET-015026")).not.toBeInTheDocument();
    expect(screen.queryByText("OTHER-1")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("SKU dòng 1"), products[0].id);
    await user.clear(screen.getByLabelText("Số lượng dòng 1"));
    await user.type(screen.getByLabelText("Số lượng dòng 1"), "10511");
    await user.clear(screen.getByLabelText("FOC dòng 1"));
    await user.type(screen.getByLabelText("FOC dòng 1"), "250");
    await user.clear(screen.getByLabelText("Ex Price dòng 1"));
    await user.type(screen.getByLabelText("Ex Price dòng 1"), "1.75");
    expect(screen.getByText("10.761")).toBeVisible();
    expect(screen.getByText("18.394,25")).toBeVisible();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.hover(screen.getByText(/Đặc trị xanh có tên/));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Đặc trị xanh có tên sản phẩm rất dài");
  });

  it("adds/removes rows and rejects selecting a duplicate SKU", async () => {
    const user = userEvent.setup();
    render(<AnnualLinesStep brandId={brandId} products={products} />);
    await user.click(screen.getByRole("button", { name: "Thêm SKU" }));
    expect(screen.getAllByRole("combobox", { name: /SKU dòng/ })).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText("SKU dòng 1"), products[0].id);
    await user.selectOptions(screen.getByLabelText("SKU dòng 2"), products[0].id);
    expect(screen.getByRole("alert")).toHaveTextContent("SKU đã có trong kế hoạch");
    await user.click(screen.getByRole("button", { name: "Xóa dòng 2" }));
    expect(screen.getAllByRole("combobox", { name: /SKU dòng/ })).toHaveLength(1);
  });

  it("reconciles an inline-created product into the selected row", async () => {
    const user = userEvent.setup();
    const onCreateProduct = vi.fn().mockResolvedValue({ id: "90000000-0000-4000-8000-000000000103", brandId, canonicalSku: "ET-015099", name: "SKU mới", isActive: true, aliases: [] });
    render(<AnnualLinesStep brandId={brandId} products={products} onCreateProduct={onCreateProduct} />);
    await user.click(screen.getByRole("button", { name: "Thêm SKU mới" }));
    await user.type(screen.getByLabelText("Mã SKU"), "et-015099");
    await user.type(screen.getByLabelText("Tên sản phẩm"), "SKU mới");
    await user.click(screen.getByRole("button", { name: "Lưu SKU" }));
    expect(await screen.findByRole("option", { name: /ET-015099/ })).toBeVisible();
    expect(onCreateProduct).toHaveBeenCalledWith({ brandId, sku: "ET-015099", name: "SKU mới" });
  });
});
