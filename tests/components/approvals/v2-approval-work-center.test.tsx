import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { V2ApprovalWorkCenter } from "@/features/approvals/components/v2-approval-work-center";

describe("V2ApprovalWorkCenter", () => {
  it("renders the unified work queue with type, route level, PO warning and deep links", () => {
    render(
      <V2ApprovalWorkCenter
        items={[
          {
            id: "case-annual",
            kind: "annual_plan",
            targetId: "annual-1",
            href: "/annual-plans/annual-1?step=review",
            title: "Kế hoạch năm",
            submittedBy: "Leader ET",
            submittedAt: "2026-08-18T00:00:00.000Z",
            brandCode: "ET",
            brandName: "Etiaxil",
            planningYear: 2026,
            currentLevel: "executive",
            assigneeId: "exec-1",
            overPlan: false,
            assignedPoLabel: null,
          },
          {
            id: "proposal-1",
            kind: "purchase_proposal",
            targetId: "proposal-1",
            href: "/proposals/proposal-1",
            title: "Đề xuất mua hàng",
            submittedBy: "Leader ET",
            submittedAt: "2026-08-18T01:00:00.000Z",
            brandCode: "ET",
            brandName: "Etiaxil",
            planningYear: 2026,
            currentLevel: "manager",
            assigneeId: "manager-1",
            overPlan: true,
            assignedPoLabel: "PO 7",
          },
          {
            id: "cancel-1",
            kind: "proposal_cancellation",
            targetId: "proposal-2",
            href: "/proposals/proposal-2",
            title: "Yêu cầu hủy đề xuất",
            submittedBy: "Leader ET",
            submittedAt: "2026-08-18T02:00:00.000Z",
            brandCode: "ET",
            brandName: "Etiaxil",
            planningYear: 2026,
            currentLevel: "executive",
            assigneeId: "exec-1",
            overPlan: false,
            assignedPoLabel: "PO 7",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Hồ sơ chờ duyệt" })).toBeVisible();
    expect(screen.getByText("Kế hoạch năm")).toBeVisible();
    expect(screen.getByText("Đề xuất mua hàng")).toBeVisible();
    expect(screen.getByText("Yêu cầu hủy đề xuất")).toBeVisible();
    expect(screen.getByText(/Quản lý · Cấp 1/)).toBeVisible();
    expect(screen.getAllByText(/CEO\/BOD · Cấp 2/)).toHaveLength(2);
    expect(screen.getByText(/Vượt kế hoạch — cần duyệt 2 cấp/)).toBeVisible();
    expect(screen.getAllByText(/PO 7/)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Mở và xử lý Đề xuất mua hàng" })).toHaveAttribute("href", "/proposals/proposal-1");
  });
});
