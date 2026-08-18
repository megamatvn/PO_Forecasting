import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MasterDataManager } from "@/features/master-data/components/master-data-manager";

const brand = { id: "90000000-0000-4000-8000-000000000101", code: "ET", name: "Etiaxil", isActive: true };

describe("MasterDataManager", () => {
  it("creates a brand from an accessible modal and adds the canonical option", async () => {
    const onCreateBrand = vi.fn().mockResolvedValue({ id: "90000000-0000-4000-8000-000000000102", code: "ABC", name: "Mới", isActive: true });
    render(<MasterDataManager initialBrands={[brand]} initialProducts={[]} onCreateBrand={onCreateBrand} onCreateProduct={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Thêm nhãn hàng" }));
    expect(screen.getByRole("dialog", { name: "Thêm nhãn hàng" })).toBeVisible();
    await user.type(screen.getByLabelText("Mã nhãn hàng"), "abc");
    await user.type(screen.getByLabelText("Tên nhãn hàng"), "Mới");
    await user.click(screen.getByRole("button", { name: "Lưu nhãn hàng" }));
    expect(onCreateBrand).toHaveBeenCalledWith(expect.objectContaining({ code: "ABC", name: "Mới" }));
  });

  it("filters products by the selected brand before creating a SKU", async () => {
    const onCreateProduct = vi.fn().mockResolvedValue({ id: "90000000-0000-4000-8000-000000000103", brandId: brand.id, canonicalSku: "ET-015025", name: "Đặc trị xanh", isActive: true, aliases: [] });
    render(<MasterDataManager initialBrands={[brand]} initialProducts={[]} onCreateBrand={vi.fn()} onCreateProduct={onCreateProduct} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Thêm SKU" }));
    expect(screen.getByRole("dialog", { name: "Thêm SKU" })).toBeVisible();
    expect(screen.getByLabelText("Nhãn hàng")).toHaveValue(brand.id);
  });
});
