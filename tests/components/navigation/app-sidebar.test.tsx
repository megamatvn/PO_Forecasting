import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppSidebar } from "@/components/ui/app-sidebar";

const etxBrand = {
  id: "10000000-0000-0000-0000-000000000001",
  code: "ETX",
  name: "ETX",
};

describe("AppSidebar", () => {
  it("lets a Viewer navigate planning but hides administration", () => {
    render(
      <AppSidebar
        access={{
          displayName: "Audit Viewer",
          roles: ["viewer"],
          brands: [etxBrand],
          activeBrandId: etxBrand.id,
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Forecast Planning" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Chính sách duyệt" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Nhãn hàng" })).toHaveValue(
      etxBrand.id,
    );
  });

  it("shows imports and policy administration to an Administrator", () => {
    render(
      <AppSidebar
        access={{
          displayName: "System Admin",
          roles: ["administrator"],
          brands: [etxBrand],
          activeBrandId: etxBrand.id,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Import dữ liệu" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Chính sách duyệt" }),
    ).toBeVisible();
  });
});
