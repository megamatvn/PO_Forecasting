import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanningWorkspace } from "@/features/planning/components/planning-workspace";

const et015150Plan = {
  brand: {
    code: "ETX",
  },
  cycle: {
    id: "40000000-0000-0000-0000-000000000001",
    code: "CYCLE-ALPHA",
    name: "ETX Forecast 2026",
    planningYear: 2026,
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
  it("keeps the ET-015150 shortage and PO proposal above the product workspace", () => {
    render(<PlanningWorkspace initialPlan={et015150Plan} />);

    expect(
      screen.getByRole("navigation", { name: "Các bước lập kế hoạch" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Kiểm tra & gửi duyệt" })).not.toBeInTheDocument();
    expect(screen.getByText("ETX · 2026")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Kế hoạch mua hàng ETX · 2026" }),
    ).toBeVisible();
    expect(screen.getByText("Ngân sách còn lại")).toBeVisible();
    expect(screen.queryByText("CYCLE-ALPHA")).not.toBeInTheDocument();
    expect(screen.queryByText(/Forecast 5M/i)).not.toBeInTheDocument();
    expect(
      screen.getByText("ET-015150 cần bổ sung 2.368 sản phẩm"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Tạo đề xuất mua" }),
    ).toBeEnabled();
  });

  it("renders actual PO waves with status and ETA on the PO step", () => {
    const { rerender } = render(
      <PlanningWorkspace
        initialPlan={et015150Plan}
        workflowStep="po"
        poBatches={[
          {
            id: "po-1",
            batchNumber: 1,
            name: "PO tháng 9",
            orderDate: "2026-08-12",
            etaDate: "2026-09-18",
            status: "confirmed",
            amount: 6417.28,
            lineCount: 1,
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Lịch cung ứng" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "PO tháng 9" })).toBeVisible();
    expect(screen.getAllByText("Đã xác nhận").length).toBeGreaterThan(1);
    expect(screen.getByText("18/09/2026")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Kiểm tra & gửi duyệt" })).not.toBeInTheDocument();

    rerender(
      <PlanningWorkspace initialPlan={et015150Plan} workflowStep="submit" />,
    );

    rerender(
      <PlanningWorkspace initialPlan={et015150Plan} workflowStep="submit" />,
    );

    expect(screen.getByRole("heading", { name: "Gửi duyệt kế hoạch" })).toBeVisible();
    expect(screen.getByText("1 sản phẩm khẩn cấp chưa xử lý")).toBeVisible();
    expect(screen.getByRole("button", { name: "Kiểm tra & gửi duyệt" })).toBeEnabled();
  });

  it("retains a submission error in the route preview and returns focus after cancellation", async () => {
    const user = userEvent.setup();
    render(
      <PlanningWorkspace
        initialPlan={et015150Plan}
        workflowStep="submit"
        previewApproval={async () => ({ levels: 2, reason: "fixed" })}
        submitApproval={async () => {
          throw new Error("network");
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Kiểm tra & gửi duyệt" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Quay lại kiểm tra" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Gửi duyệt 2 cấp" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể gửi duyệt. Kế hoạch chưa bị thay đổi.",
    );
    expect(screen.getByRole("dialog")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Quay lại kiểm tra" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("selects a SKU, applies its recommendation, and keeps the saved draft when returning", async () => {
    const user = userEvent.setup();
    const plan = {
      ...et015150Plan,
      rows: [
        et015150Plan.rows[0],
        {
          ...et015150Plan.rows[0],
          planLineId: "42000000-0000-0000-0000-000000000002",
          productId: "20000000-0000-0000-0000-000000000025",
          sku: "ET-015025",
          productName: "Đặc trị xanh",
          openingStock: 319_321,
          annualDemand: 1_000_787,
          exPrice: "4.20",
          projectedStock: -681_466,
          recommendedQty: 681_466,
        },
      ],
    };
    render(<PlanningWorkspace initialPlan={plan} />);

    await user.click(
      screen.getByRole("row", { name: /ET-015025.*Đặc trị xanh/i }),
    );
    expect(screen.getByRole("heading", { name: "ET-015025" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Điền đề xuất" }));
    expect(screen.getByLabelText("Số lượng đặt")).toHaveValue("681.466");
    expect(screen.getByLabelText("Thành tiền")).toHaveValue("2862157.20");

    await user.click(
      screen.getByRole("row", { name: /ET-015150.*ET-015150/i }),
    );
    await user.click(
      screen.getByRole("row", { name: /ET-015025.*Đặc trị xanh/i }),
    );
    expect(screen.getByLabelText("Số lượng đặt")).toHaveValue("681.466");
  });

  it("announces autosave progress from the detail editor", async () => {
    const user = userEvent.setup();
    let resolveSave: ((value: { lockVersion: number }) => void) | undefined;
    const saveDraft = vi.fn(
      () => new Promise<{ lockVersion: number }>((resolve) => { resolveSave = resolve; }),
    );
    render(
      <PlanningWorkspace
        initialPlan={et015150Plan}
        saveDraft={saveDraft}
        autosaveDelayMs={20}
      />,
    );

    await user.clear(screen.getByLabelText("Số lượng đặt"));
    await user.type(screen.getByLabelText("Số lượng đặt"), "10");
    expect(screen.getByText("Đang lưu…")).toBeVisible();

    await vi.waitFor(() => expect(saveDraft).toHaveBeenCalled());
    resolveSave?.({ lockVersion: 1 });
    const savedStatus = await screen.findByText("Đã lưu");
    expect(savedStatus).toBeVisible();
    expect(savedStatus).toHaveAttribute("aria-live", "polite");
  });

  it("announces an autosave error while preserving the editable draft", async () => {
    const saveDraft = vi.fn().mockRejectedValue(new Error("network"));
    render(
      <PlanningWorkspace
        initialPlan={et015150Plan}
        saveDraft={saveDraft}
        autosaveDelayMs={0}
      />,
    );

    fireEvent.change(screen.getByLabelText("Số lượng đặt"), {
      target: { value: "10" },
    });

    expect(await screen.findByText("Lỗi lưu")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể lưu thay đổi. Dữ liệu local vẫn được giữ lại.",
    );
    expect(screen.getByLabelText("Số lượng đặt")).toHaveValue("10");
  });

  it("switches mobile view from the SKU list to detail and back without losing the selected row", async () => {
    const user = userEvent.setup();
    render(<PlanningWorkspace initialPlan={et015150Plan} />);

    const workspace = document.querySelector(".planning-workspace__detail");
    expect(workspace).toHaveAttribute("data-planning-view", "list");

    await user.click(screen.getByRole("row", { name: /ET-015150/i }));
    expect(workspace).toHaveAttribute("data-planning-view", "detail");
    expect(screen.getByRole("heading", { name: "ET-015150" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Quay lại danh sách" }));
    expect(workspace).toHaveAttribute("data-planning-view", "list");
    expect(screen.getByRole("row", { name: /ET-015150/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("opens a valid direct-linked product in detail view", () => {
    const directPlan = {
      ...et015150Plan,
      rows: [
        et015150Plan.rows[0],
        {
          ...et015150Plan.rows[0],
          planLineId: "line-direct",
          productId: "product-direct",
          sku: "ET-015025",
          productName: "Đặc trị xanh",
        },
      ],
    };

    render(
      <PlanningWorkspace
        initialPlan={directPlan}
        initialSelectedPlanLineId="line-direct"
      />,
    );

    expect(document.querySelector(".planning-workspace__detail")).toHaveAttribute(
      "data-planning-view",
      "detail",
    );
    expect(screen.getByRole("heading", { name: "ET-015025" })).toBeVisible();
    expect(screen.getByRole("row", { name: /ET-015025.*Đặc trị xanh/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
