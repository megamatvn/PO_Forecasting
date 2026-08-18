import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ApprovalReview,
  SubmitPlanDialog,
} from "@/features/approvals/components/approval-review";
import { ApprovalInbox } from "@/features/approvals/components/approval-inbox";
import { PolicyEditor } from "@/features/approvals/components/policy-editor";
import { PlanningWorkspace } from "@/features/planning/components/planning-workspace";

const reviewRequest = {
  id: "70000000-0000-0000-0000-000000000001",
  cycleCode: "ETX-2026",
  planVersionId: "41000000-0000-0000-0000-000000000001",
  versionNumber: 4,
  status: "pending_l1" as const,
  currentLevel: 1,
  requiredLevels: 2 as const,
  planAmount: "6417.28",
  currencyCode: "EUR",
  routingReason: "fixed" as const,
  exceptionFlags: { criticalShortage: true },
  submittedAt: "2026-08-11T08:30:00.000Z",
  submittedBy: "Nguyễn An",
  criticalCount: 1,
  shortageImpact: -2368,
  amountChange: 6417.28,
  diffs: [],
};

describe("SubmitPlanDialog", () => {
  it("explains the default two-level route before submission", () => {
    render(
      <SubmitPlanDialog
        open
        route={{ levels: 2, reason: "fixed" }}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Kế hoạch sẽ được duyệt 2 cấp" }),
    ).toBeVisible();
    expect(screen.getByText("Kế hoạch sẽ được duyệt 2 cấp")).toBeVisible();
    expect(screen.getByText("Quản lý nhãn hàng → Ban điều hành")).toBeVisible();
    expect(
      screen.getByText(/chính sách được chụp tại thời điểm gửi/i),
    ).toBeVisible();
  });

  it("focuses the cancel action and closes with Escape", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmitPlanDialog
        open
        route={{ levels: 2, reason: "fixed" }}
        onCancel={onCancel}
        onConfirm={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Quay lại kiểm tra" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps Tab focus inside the submission dialog", async () => {
    const user = userEvent.setup();
    render(
      <SubmitPlanDialog
        open
        route={{ levels: 2, reason: "fixed" }}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    const cancel = screen.getByRole("button", { name: "Quay lại kiểm tra" });
    const confirm = screen.getByRole("button", { name: "Gửi duyệt 2 cấp" });
    expect(cancel).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(confirm).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(cancel).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(confirm).toHaveFocus();
  });
});

describe("ApprovalReview", () => {
  it("does not render decision controls for a read-only viewer", () => {
    render(
      <ApprovalReview
        request={{ ...reviewRequest, canDecide: false }}
        onDecision={async () => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: "Phê duyệt" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Yêu cầu chỉnh sửa" }),
    ).not.toBeInTheDocument();
  });

  it("requires a non-empty reason before requesting changes", async () => {
    const onDecision = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ApprovalReview
        request={{ ...reviewRequest, canDecide: true }}
        onDecision={onDecision}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Yêu cầu chỉnh sửa" }));
    expect(
      screen.getByRole("button", { name: "Xác nhận yêu cầu chỉnh sửa" }),
    ).toBeDisabled();

    await user.type(
      screen.getByLabelText("Lý do yêu cầu chỉnh sửa"),
      "Bổ sung Ex Price cho ET-015150",
    );
    await user.click(
      screen.getByRole("button", { name: "Xác nhận yêu cầu chỉnh sửa" }),
    );

    expect(onDecision).toHaveBeenCalledWith({
      action: "request_changes",
      comment: "Bổ sung Ex Price cho ET-015150",
    });
  });

  it("makes the current level, status and exception summary prominent", () => {
    render(
      <ApprovalReview
        request={{ ...reviewRequest, canDecide: false }}
        onDecision={async () => undefined}
      />,
    );

    expect(screen.getByText("Chờ cấp 1")).toBeVisible();
    expect(screen.getByText("Cấp duyệt 1/2")).toBeVisible();
    expect(screen.getByText(/Thiếu hàng critical/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Phiên bản 4" })).toBeVisible();
  });
});

describe("ApprovalInbox", () => {
  it("marks the selected dossier with an accessible current state and route summary", () => {
    render(
      <ApprovalInbox
        requests={[
          { ...reviewRequest, canDecide: false },
          {
            ...reviewRequest,
            id: "70000000-0000-0000-0000-000000000002",
            status: "pending_l2",
            currentLevel: 2,
            exceptionFlags: { budgetExceeded: true },
            canDecide: false,
          },
        ]}
        activeRequestId={reviewRequest.id}
      />,
    );

    const selected = screen
      .getAllByRole("link", { name: /ETX-2026.*Phiên bản 4/i })
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(selected).toBeDefined();
    expect(selected).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Đang xem")).toBeVisible();
    expect(screen.getByText("Cấp duyệt 1/2")).toBeVisible();
    expect(screen.getByText("Thiếu hàng critical")).toBeVisible();
    expect(screen.getByText("Vượt ngân sách")).toBeVisible();
    expect(screen.getByText("Chờ cấp 2")).toBeVisible();
  });
});

describe("PolicyEditor", () => {
  it("guides configuration through one expanded section at a time", async () => {
    const user = userEvent.setup();
    render(
      <PolicyEditor
        brands={[
          { id: "brand-etx", code: "ETX", name: "Etiaxil" },
          { id: "brand-abc", code: "ABC", name: "ABC" },
        ]}
        onSave={async () => undefined}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Áp dụng cho nhãn hàng" }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Tên chính sách" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("ETX · Etiaxil")).toBeVisible();
    expect(screen.getByLabelText("ABC · ABC")).toBeVisible();
    expect(
      screen.getAllByText(/không thay đổi hồ sơ đang duyệt/i)[0],
    ).toBeVisible();

    await user.click(screen.getByLabelText("ETX · Etiaxil"));
    await user.click(
      screen.getByRole("button", { name: "Tiếp tục đến tuyến duyệt" }),
    );

    expect(screen.getByRole("textbox", { name: "Tên chính sách" })).toBeVisible();
    expect(
      screen.getByRole("radio", { name: /^Duyệt 2 cấp bắt buộc/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Chỉnh sửa phạm vi" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("mirrors the canonical draft in the live confirmation summary", async () => {
    const user = userEvent.setup();
    render(
      <PolicyEditor
        brands={[
          { id: "brand-etx", code: "ETX", name: "ETX" },
          { id: "brand-abc", code: "ABC", name: "ABC" },
        ]}
        onSave={async () => undefined}
      />,
    );

    await user.click(screen.getByLabelText("ETX · ETX"));
    await user.click(screen.getByRole("button", { name: "Tiếp tục đến tuyến duyệt" }));
    await user.type(screen.getByLabelText("Tên chính sách"), "ETX 2026");
    await user.click(screen.getByRole("button", { name: "Tiếp tục đến ngoại lệ và hiệu lực" }));
    await user.type(screen.getByLabelText("Hiệu lực từ"), "2026-01-01");

    expect(screen.getByRole("heading", { name: "Xác nhận" })).toBeVisible();
    expect(screen.getByText("Nhãn hàng áp dụng")).toBeVisible();
    expect(screen.getByText("ETX · ETX")).toBeVisible();
    expect(screen.getAllByText("Duyệt 2 cấp bắt buộc")).toHaveLength(2);
    expect(screen.getByText("Từ 01/01/2026")).toBeVisible();
  });

  it("shows a top validation summary and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    render(<PolicyEditor brands={[]} onSave={async () => undefined} />);

    await user.click(screen.getByRole("button", { name: "Lưu chính sách" }));

    expect(
      screen.getByRole("alert", { name: "Vui lòng kiểm tra các trường cần thiết" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Tên chính sách")).toHaveFocus();
  });

  it("focuses the end date when it precedes the effective start date", async () => {
    const user = userEvent.setup();
    render(
      <PolicyEditor
        brands={[{ id: "brand-etx", code: "ETX", name: "ETX" }]}
        onSave={async () => undefined}
      />,
    );

    await user.click(screen.getByLabelText("ETX · ETX"));
    await user.click(screen.getByRole("button", { name: "Tiếp tục đến tuyến duyệt" }));
    await user.type(screen.getByLabelText("Tên chính sách"), "ETX 2026");
    await user.click(screen.getByRole("button", { name: "Tiếp tục đến ngoại lệ và hiệu lực" }));
    await user.type(screen.getByLabelText("Hiệu lực từ"), "2026-02-01");
    await user.type(screen.getByLabelText("Hiệu lực đến"), "2026-01-01");
    await user.click(screen.getByRole("button", { name: "Lưu chính sách" }));

    expect(
      screen.getByRole("alert", { name: "Vui lòng kiểm tra các trường cần thiết" }),
    ).toBeVisible();
    expect(
      screen.getByText("Ngày kết thúc phải sau ngày bắt đầu."),
    ).toBeVisible();
    expect(screen.getByDisplayValue("2026-01-01")).toHaveFocus();
  });
});

describe("Planning submission", () => {
  it("previews the active route before submitting an immutable policy snapshot", async () => {
    const previewApproval = vi.fn().mockResolvedValue({ levels: 2, reason: "fixed" });
    const submitApproval = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <PlanningWorkspace
        initialPlan={{
          brand: { code: "ETX" },
          cycle: {
            id: "cycle",
            code: "ETX-2026",
            name: "ETX Forecast 2026",
            planningYear: 2026,
            currencyCode: "EUR",
            targetPurchaseAmount: "100000",
          },
          version: {
            id: "41000000-0000-0000-0000-000000000001",
            versionNumber: 1,
            status: "draft",
            lockVersion: 0,
            updatedAt: "2026-08-11T08:30:00.000Z",
          },
          canEdit: true,
          rows: [],
        }}
        workflowStep="submit"
        previewApproval={previewApproval}
        submitApproval={submitApproval}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Kiểm tra & gửi duyệt" }),
    );
    expect(await screen.findByText("Kế hoạch sẽ được duyệt 2 cấp")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Gửi duyệt 2 cấp" }));

    expect(submitApproval).toHaveBeenCalledOnce();
  });
});
