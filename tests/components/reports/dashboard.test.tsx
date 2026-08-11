import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardKpis } from "@/features/reports/components/dashboard-kpis";
import { PoTimeline } from "@/features/reports/components/po-timeline";

describe("DashboardKpis", () => {
  it("makes target, committed, gap and critical stock scannable", () => {
    render(
      <DashboardKpis
        currencyCode="EUR"
        kpis={{
          targetAmount: 100000,
          committedAmount: 29600,
          gapAmount: 70400,
          criticalCount: 1,
          poCount: 2,
        }}
      />,
    );

    expect(screen.getByText("Ngân sách mục tiêu")).toBeVisible();
    expect(screen.getByText(/29\.600.*€/)).toBeVisible();
    expect(screen.getByText("1 SKU")).toBeVisible();
    expect(screen.getByText("2 đợt PO")).toBeVisible();
  });
});

describe("PoTimeline", () => {
  it("shows dynamic PO waves and their operational status", () => {
    render(
      <PoTimeline
        currencyCode="EUR"
        batches={[
          {
            id: "po-1",
            batchNumber: 1,
            name: "PO #1",
            orderDate: "2026-01-05",
            etaDate: "2026-02-10",
            status: "confirmed",
            amount: 12525,
            lineCount: 12,
          },
          {
            id: "po-2",
            batchNumber: 2,
            name: "PO bổ sung Critical",
            orderDate: "2026-08-11",
            etaDate: "2026-09-15",
            status: "planned",
            amount: 29600,
            lineCount: 1,
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "PO #1" })).toBeVisible();
    expect(screen.getByText("PO bổ sung Critical")).toBeVisible();
    expect(screen.getAllByText("Đã xác nhận").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dự kiến").length).toBeGreaterThan(0);
  });
});
