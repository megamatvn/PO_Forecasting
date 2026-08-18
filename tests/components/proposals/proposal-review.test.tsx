import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProposalReview } from "@/features/proposals/components/proposal-review";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const base = {
  id: "90000000-0000-4000-8000-000000000302",
  proposalId: "90000000-0000-4000-8000-000000000302",
  revisionId: "90000000-0000-4000-8000-000000000303",
  status: "pending_manager" as const,
  lockVersion: 1,
  brandId: "90000000-0000-4000-8000-000000000101",
  brandCode: "ET",
  brandName: "Etiaxil",
  brand: { code: "ET", name: "Etiaxil" },
  planningYear: 2026,
  neededMonth: "2026-03",
  reason: "Bổ sung nhu cầu bán hàng",
  ownerName: "Leader ET",
  managerName: "Manager ET",
  executiveName: "CEO Sagen",
  lines: [{ productId: "90000000-0000-4000-8000-000000000201", sku: "ET-015025", name: "Đặc trị xanh", requestedQty: 55000 }],
  waves: [{ id: "90000000-0000-4000-8000-000000000401", sequence: 1, neededMonth: "2026-03", capacityByProduct: [{ productId: "90000000-0000-4000-8000-000000000201", plannedQty: 50000, remainingQty: 50000 }] }],
  canDecide: true,
  canDecideCancellation: false,
  canAssignWave: true,
  canWithdraw: false,
  ownerId: "90000000-0000-4000-8000-000000000001",
  assignedManagerName: "Manager ET",
  assignedExecutiveName: "CEO Sagen",
  routeKind: "manager_then_executive" as const,
  routeReason: "over_plan",
  updatedAt: "2026-01-01T00:00:00Z",
  viewerMode: "manager" as const,
};

describe("ProposalReview", () => {
  it("makes PO selection explicit and warns when requested quantity exceeds capacity", async () => {
    const user = userEvent.setup();
    render(<ProposalReview proposal={base} onAssignWave={vi.fn()} onDecision={vi.fn()} />);
    expect(screen.getByText("Chờ quản lý")).toBeVisible();
    expect(screen.getByLabelText("PO ghi nhận")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("PO ghi nhận"), "90000000-0000-4000-8000-000000000401");
    expect(screen.getByText("Vượt kế hoạch — chuyển duyệt 2 cấp")).toBeVisible();
    expect(screen.getByText(/còn lại 50\.000/i)).toBeVisible();
  });

  it("does not expose Ex Price or annual baseline values to the submitter view", () => {
    render(<ProposalReview proposal={{ ...base, canDecide: false, canAssignWave: false, viewerMode: "owner" }} onAssignWave={vi.fn()} onDecision={vi.fn()} />);
    expect(screen.queryByText(/Ex Price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Giá trị kế hoạch/i)).not.toBeInTheDocument();
  });

  it("persists the selected PO when the page owns the default assignment transport", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { lockVersion: 2 } }), { status: 200 }));
    render(<ProposalReview proposal={base} />);
    await user.selectOptions(screen.getByLabelText("PO ghi nhận"), "90000000-0000-4000-8000-000000000401");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v2/proposals/${base.id}/assign-wave`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ body: expect.stringContaining('"waveId":"90000000-0000-4000-8000-000000000401"') }));
    fetchMock.mockRestore();
  });
});
