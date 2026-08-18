import { render, screen, waitFor, within } from "@testing-library/react";
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

    expect(screen.getByRole("list", { name: "Tiến trình nhập dữ liệu" })).toBeVisible();
    expect(screen.getByText("Chọn file")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Kiểm tra")).toBeVisible();
    expect(screen.getByText("Xác nhận nhập dữ liệu")).toBeVisible();

    expect(
      screen.getByRole("heading", { name: "Chọn file kế hoạch để kiểm tra" }),
    ).toBeVisible();
    expect(screen.queryByText(/Forecast 5M/i)).not.toBeInTheDocument();

    const file = new File(["synthetic workbook"], "forecast.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText("Chọn file Excel"), file);

    expect(await screen.findByText("Kiểm tra")).toHaveAttribute(
      "aria-current",
      "step",
    );

    const changedRows = await screen.findByRole("region", {
      name: "Thay đổi",
    });
    expect(
      within(changedRows).getByText("ET-015027 → ET-015025"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xác nhận nhập dữ liệu" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: /Tôi đã kiểm tra các cảnh báo/ }),
    );

    expect(
      screen.getByRole("button", { name: "Xác nhận nhập dữ liệu" }),
    ).toBeEnabled();
  });

  it("shows the selected brand and workbook planning year in the preview metadata", async () => {
    const transport = makeTransport();
    transport.preview = vi.fn().mockResolvedValue({
      ...await transport.preview(new File(["seed"], "seed.xlsx"), brandId),
      sourceSheetName: "Kế hoạch ETX",
      planningYear: 2026,
    });
    const user = userEvent.setup();
    render(
      <ImportWorkflow
        brandId={brandId}
        brandLabel="ETX · Etiaxil"
        transport={transport}
      />,
    );

    await user.upload(
      screen.getByLabelText("Chọn file Excel"),
      new File(["workbook"], "forecast.xlsx"),
    );

    expect(await screen.findByText("ETX · Etiaxil")).toBeVisible();
    expect(screen.getByText("Kế hoạch ETX")).toBeVisible();
    expect(screen.getByText("2026")).toBeVisible();
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
      screen.getByRole("button", { name: "Xác nhận nhập dữ liệu" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Nhập dữ liệu hoàn tất",
    );
    expect(screen.getByText("2 bản nháp bị ảnh hưởng")).toBeVisible();
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
      screen.getByRole("button", { name: "Xác nhận nhập dữ liệu" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "thử lại an toàn",
    );

    await user.click(
      screen.getByRole("button", { name: "Xác nhận nhập dữ liệu" }),
    );
    await screen.findByText("Nhập dữ liệu hoàn tất");

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
      screen.getByRole("button", { name: "Xác nhận nhập dữ liệu" }),
    ).toBeDisabled();
  });

  it("retains the selected file while choosing an ambiguous source sheet", async () => {
    const transport = makeTransport();
    const preview = vi
      .fn()
      .mockRejectedValueOnce({
        code: "sheet_selection_required",
        message: "Có nhiều sheet kế hoạch phù hợp.",
        candidates: [
          {
            sheetName: "Kế hoạch ETX 2026",
            headerRow: 5,
            score: 7,
            missingHeaders: [],
          },
          {
            sheetName: "Kế hoạch ETX 2027",
            headerRow: 5,
            score: 6,
            missingHeaders: ["PO Amount"],
          },
        ],
      })
      .mockResolvedValueOnce({
        batchId: "50000000-0000-0000-0000-000000000002",
        checksum: "selected-checksum",
        sourceSheetName: "Kế hoạch ETX 2027",
        canCommit: true,
        rows: [],
        issues: [],
      });
    transport.preview = preview;
    const user = userEvent.setup();
    render(<ImportWorkflow brandId={brandId} transport={transport} />);

    const file = new File(["workbook"], "multi-sheet.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText("Chọn file Excel"), file);

    expect(
      await screen.findByRole("radiogroup", {
        name: "Chọn trang tính kế hoạch",
      }),
    ).toBeVisible();
    expect(screen.getByText("Kế hoạch ETX 2026")).toBeVisible();
    expect(screen.getByText(/Điểm nhận diện: 7\/7/)).toBeVisible();
    expect(screen.getByText("Thiếu: PO Amount")).toBeVisible();
    expect(screen.getByText("Đang chờ chọn trang tính")).toBeVisible();

    const secondCandidate = screen.getByRole("radio", {
      name: /Kế hoạch ETX 2027/,
    });
    secondCandidate.focus();
    await user.keyboard(" ");

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(preview.mock.calls[1]).toEqual([
      file,
      brandId,
      "Kế hoạch ETX 2027",
    ]);
    expect(await screen.findByText("Kế hoạch ETX 2027", { selector: "dd" })).toBeVisible();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("shows a recoverable error when the selected sheet is rejected", async () => {
    const transport = makeTransport();
    transport.preview = vi
      .fn()
      .mockRejectedValueOnce({
        code: "sheet_selection_required",
        message: "Có nhiều sheet kế hoạch phù hợp.",
        candidates: [
          {
            sheetName: "Kế hoạch ETX 2026",
            headerRow: 5,
            score: 7,
            missingHeaders: [],
          },
        ],
      })
      .mockRejectedValueOnce(new Error("sheet rejected"));
    const user = userEvent.setup();
    render(<ImportWorkflow brandId={brandId} transport={transport} />);

    await user.upload(
      screen.getByLabelText("Chọn file Excel"),
      new File(["workbook"], "multi-sheet.xlsx"),
    );
    await user.click(
      await screen.findByRole("radio", { name: /Kế hoạch ETX 2026/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tạo bản xem trước",
    );
    expect(screen.getByLabelText("Chọn file Excel")).toBeVisible();
  });
});
