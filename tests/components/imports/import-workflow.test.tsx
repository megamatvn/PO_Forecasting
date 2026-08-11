import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImportWorkflow } from "@/features/imports/components/import-workflow";
import type { ImportWorkflowTransport } from "@/features/imports/hooks/use-import-workflow";

const brandId = "10000000-0000-0000-0000-000000000001";

function makeTransport(): ImportWorkflowTransport {
  return {
    preview: vi.fn().mockResolvedValue({
      batchId: "50000000-0000-0000-0000-000000000001",
      checksum: "synthetic-checksum",
      canCommit: true,
      rows: [
        {
          rowNumber: 7,
          rawSku: "ET-015027",
          canonicalSku: "ET-015025",
          productName: "Đặc trị xanh",
          exPrice: "12.5",
          currentStock: 100,
          purchaseWaves: [],
        },
      ],
      issues: [
        {
          severity: "warning",
          rowNumber: 7,
          field: "amount",
          code: "formula_mismatch",
          message: "Amount trong file khác Qty × Ex Price.",
        },
      ],
    }),
    commit: vi.fn().mockResolvedValue({
      snapshotId: "60000000-0000-0000-0000-000000000001",
      committedAt: "2026-08-11T08:30:00.000Z",
      affectedDraftCount: 2,
    }),
  };
}

describe("ImportWorkflow", () => {
  it("previews alias mapping and requires warning confirmation before commit", async () => {
    const transport = makeTransport();
    const user = userEvent.setup();
    render(<ImportWorkflow brandId={brandId} transport={transport} />);

    const file = new File(["synthetic workbook"], "forecast.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText("Chọn file Excel"), file);

    const changedRows = await screen.findByRole("region", {
      name: "Thay đổi",
    });
    expect(
      within(changedRows).getByText("ET-015027 → ET-015025"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xác nhận import" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: /Tôi đã kiểm tra các cảnh báo/ }),
    );

    expect(
      screen.getByRole("button", { name: "Xác nhận import" }),
    ).toBeEnabled();
  });

  it("shows the committed snapshot timestamp and affected Draft count", async () => {
    const transport = makeTransport();
    const user = userEvent.setup();
    render(<ImportWorkflow brandId={brandId} transport={transport} />);

    await user.upload(
      screen.getByLabelText("Chọn file Excel"),
      new File(["workbook"], "forecast.xlsx"),
    );
    await screen.findByText("ET-015027 → ET-015025");
    await user.click(
      screen.getByRole("checkbox", { name: /Tôi đã kiểm tra các cảnh báo/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Xác nhận import" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Import hoàn tất",
    );
    expect(screen.getByText("2 bản Draft bị ảnh hưởng")).toBeVisible();
    expect(screen.getByText(/11\/08\/2026/)).toBeVisible();
  });

  it("reuses one idempotency key when a failed commit is retried", async () => {
    const transport = makeTransport();
    const commit = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({
        snapshotId: "60000000-0000-0000-0000-000000000001",
        committedAt: "2026-08-11T08:30:00.000Z",
        affectedDraftCount: 1,
      });
    transport.commit = commit;
    const user = userEvent.setup();
    render(<ImportWorkflow brandId={brandId} transport={transport} />);

    await user.upload(
      screen.getByLabelText("Chọn file Excel"),
      new File(["workbook"], "forecast.xlsx"),
    );
    await screen.findByText("ET-015027 → ET-015025");
    await user.click(
      screen.getByRole("checkbox", { name: /Tôi đã kiểm tra các cảnh báo/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Xác nhận import" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "thử lại an toàn",
    );

    await user.click(
      screen.getByRole("button", { name: "Xác nhận import" }),
    );
    await screen.findByText("Import hoàn tất");

    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[1][0].idempotencyKey).toBe(
      commit.mock.calls[0][0].idempotencyKey,
    );
  });

  it("blocks commit when preview contains an error", async () => {
    const transport = makeTransport();
    transport.preview = vi.fn().mockResolvedValue({
      batchId: "50000000-0000-0000-0000-000000000001",
      checksum: "invalid-checksum",
      canCommit: false,
      rows: [
        {
          rowNumber: 9,
          rawSku: "UNKNOWN",
          canonicalSku: "UNKNOWN",
          productName: "Chưa ánh xạ",
          exPrice: "10",
          currentStock: 0,
          purchaseWaves: [],
        },
      ],
      issues: [
        {
          severity: "error",
          rowNumber: 9,
          field: "rawSku",
          code: "unknown_sku",
          message: "SKU UNKNOWN chưa được ánh xạ vào danh mục sản phẩm.",
        },
      ],
    });
    const user = userEvent.setup();
    render(<ImportWorkflow brandId={brandId} transport={transport} />);

    await user.upload(
      screen.getByLabelText("Chọn file Excel"),
      new File(["invalid workbook"], "forecast.xlsx"),
    );

    expect(await screen.findByText(/SKU UNKNOWN chưa được ánh xạ/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xác nhận import" }),
    ).toBeDisabled();
  });
});
