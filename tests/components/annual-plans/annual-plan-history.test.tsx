import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnnualPlanHistory } from "@/features/annual-plans/components/annual-plan-history";

describe("AnnualPlanHistory", () => {
  it("renders Vietnamese statuses and a structured immutable diff", () => {
    render(<AnnualPlanHistory
      revisions={[
        { id: "r2", revisionNumber: 2, status: "approved", ownerName: "B", createdAt: "2026-08-17T09:00:00Z", approvedAt: "2026-08-17T10:00:00Z", approverName: "CEO Sagen", changes: [{ label: "ET-015025 · Số lượng trả tiền", before: "10.000", after: "11.000" }] },
        { id: "r1", revisionNumber: 1, status: "superseded", ownerName: "A", createdAt: "2026-08-16T09:00:00Z", approvedAt: "2026-08-16T10:00:00Z", approverName: "CEO cũ", changes: [] },
      ]}
      currentApprovedRevisionId="r2"
      onCreateRevision={vi.fn()}
    />);
    expect(screen.getByRole("heading", { name: "Lịch sử phiên bản" })).toBeVisible();
    expect(screen.getByText("Đã phê duyệt")).toBeVisible();
    expect(screen.getByText("Đã thay thế")).toBeVisible();
    expect(screen.getByText(/ET-015025/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Tạo phiên bản điều chỉnh" })).toBeEnabled();
  });

  it("does not offer a revision action from a non-approved baseline", () => {
    render(<AnnualPlanHistory revisions={[{ id: "r1", revisionNumber: 1, status: "pending_executive", ownerName: "A", createdAt: "2026-08-16T09:00:00Z", approvedAt: null, approverName: null, changes: [] }]} currentApprovedRevisionId={null} onCreateRevision={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Tạo phiên bản điều chỉnh" })).not.toBeInTheDocument();
  });
});
