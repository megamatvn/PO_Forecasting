import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricStrip } from "@/components/ui/metric-strip";
import { PageHeader } from "@/components/ui/page-header";
import { PlanContextBar } from "@/components/ui/plan-context-bar";

describe("operations UI primitives", () => {
  it("keeps page headings sequential while exposing breadcrumb navigation", () => {
    render(
      <>
        <PageHeader
          breadcrumb={[{ label: "Tổng quan", href: "/dashboard" }, { label: "ETX" }]}
          title="Kế hoạch mua hàng 2026"
          description="Tình hình ngân sách, tồn kho và các đợt đặt hàng."
        />
        <MetricStrip
          title="Chỉ số kế hoạch"
          items={[{ label: "Ngân sách mục tiêu", value: "5.000.000 EUR" }]}
        />
      </>,
    );

    expect(screen.getByRole("navigation", { name: "Đường dẫn" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Tổng quan" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Kế hoạch mua hàng 2026" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Chỉ số kế hoạch" })).toBeVisible();
  });

  it("keeps compact eyebrow and context metadata inside the shared header", () => {
    render(
      <PageHeader
        eyebrow="Dữ liệu"
        title="Import dữ liệu kế hoạch"
        description="Kiểm tra dữ liệu trước khi tạo snapshot nguồn mới."
        context={<span>Bản nháp</span>}
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Import dữ liệu kế hoạch",
    });
    const header = heading.closest("header");

    expect(header).toHaveTextContent("Dữ liệu");
    expect(header).toHaveTextContent("Bản nháp");
    expect(header?.querySelector(".page-header__context")).not.toBeNull();
  });

  it("announces each plan context value with its accessible label", () => {
    render(
      <PlanContextBar
        brand="ETX · Etiaxil"
        year="2026"
        version="Bản nháp V1"
        status="Đang chỉnh sửa"
      />,
    );

    const context = screen.getByRole("region", { name: "Bối cảnh kế hoạch" });
    expect(context).toHaveTextContent("Nhãn hàng");
    expect(context).toHaveTextContent("ETX · Etiaxil");
    expect(context).toHaveTextContent("Kỳ kế hoạch");
    expect(context).toHaveTextContent("2026");
    expect(context).toHaveTextContent("Phiên bản");
    expect(context).toHaveTextContent("Bản nháp V1");
    expect(context).toHaveTextContent("Trạng thái");
    expect(context).toHaveTextContent("Đang chỉnh sửa");
  });

  it("renders metric labels, values and supporting context without relying on tone alone", () => {
    render(
      <MetricStrip
        title="Chỉ số kế hoạch"
        items={[
          { label: "Ngân sách mục tiêu", value: "5.000.000 EUR" },
          {
            label: "SKU cần xử lý",
            value: "13 SKU",
            supportingText: "Có thiếu hàng cần xử lý trước khi gửi duyệt",
            tone: "critical",
          },
        ]}
      />,
    );

    expect(screen.getByText("Ngân sách mục tiêu")).toBeVisible();
    expect(screen.getByText("5.000.000 EUR")).toBeVisible();
    expect(screen.getByText("SKU cần xử lý")).toBeVisible();
    expect(screen.getByText("13 SKU")).toBeVisible();
    expect(
      screen.getByText("Có thiếu hàng cần xử lý trước khi gửi duyệt"),
    ).toBeVisible();
  });
});
