import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnnualPlanReview } from "@/features/annual-plans/components/annual-plan-review";

describe("AnnualPlanReview", () => {
  const base = {
    revisionId: "90000000-0000-4000-8000-000000000302",
    ownerName: "Nguyễn Văn A",
    brand: { code: "ET", name: "Etiaxil" },
    planningYear: 2026,
    status: "draft_owner_only" as const,
    role: "manager" as const,
    assignedExecutiveName: "CEO Sagen",
    totals: { budget: "18.394 €", paidQty: "10.511", focQty: "0", skuCount: 2, waveCount: 2 },
    waves: [
      { id: "wave-1", sequence: 1, orderMonth: "2026-01", arrivalMonth: "2026-02", total: "12.000 €" },
      { id: "wave-2", sequence: 2, orderMonth: "2026-04", arrivalMonth: "2026-05", total: "6.394 €" },
    ],
    errors: [],
    warnings: ["Một đợt mua có giá trị thấp hơn mức thông thường."],
    onSubmit: vi.fn(),
    onSaveDraft: vi.fn(),
  };

  it("shows a decision-ready summary and the manager submission action", () => {
    render(<AnnualPlanReview {...base} />);
    expect(screen.getByRole("heading", { name: "Kiểm tra và xác nhận" })).toBeVisible();
    expect(screen.getByText("18.394 €")).toBeVisible();
    expect(screen.getByText(/CEO Sagen/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Hoàn tất & gửi CEO\/BOD duyệt" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Một đợt mua");
  });

  it("confirms before submitting and keeps focus in the dialog", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AnnualPlanReview {...base} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Hoàn tất & gửi CEO\/BOD duyệt" }));
    expect(screen.getByRole("dialog", { name: "Xác nhận gửi duyệt" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses an executive auto-approval action when the owner is CEO/BOD", () => {
    render(<AnnualPlanReview {...base} role="executive" status="draft_owner_only" />);
    expect(screen.getByRole("button", { name: "Hoàn tất & phê duyệt" })).toBeVisible();
    expect(screen.queryByText(/gửi CEO\/BOD/)).not.toBeInTheDocument();
  });
});
