import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ApprovalReview,
  SubmitPlanDialog,
} from "@/features/approvals/components/approval-review";
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

    expect(screen.getByText("Kế hoạch sẽ được duyệt 2 cấp")).toBeVisible();
    expect(screen.getByText("Manager → CFO/CEO")).toBeVisible();
    expect(
      screen.getByText(/chính sách được chụp tại thời điểm gửi/i),
    ).toBeVisible();
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
});

describe("PolicyEditor", () => {
  it("supports bulk brand selection and preserves in-flight policy snapshots", () => {
    render(
      <PolicyEditor
        brands={[
          { id: "brand-etx", code: "ETX", name: "ETX" },
          { id: "brand-abc", code: "ABC", name: "ABC" },
        ]}
        onSave={async () => undefined}
      />,
    );

    expect(screen.getByLabelText("ETX · ETX")).toBeVisible();
    expect(screen.getByLabelText("ABC · ABC")).toBeVisible();
    expect(screen.getByText(/không thay đổi hồ sơ đang duyệt/i)).toBeVisible();
    expect(
      screen.getByRole("radio", { name: /^Duyệt 2 cấp bắt buộc/ }),
    ).toBeChecked();
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
          cycle: {
            id: "cycle",
            code: "ETX-2026",
            name: "ETX Forecast 2026",
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
