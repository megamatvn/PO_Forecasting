import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExcelImportDialog } from "@/features/annual-plans/components/excel-import-dialog";

describe("ExcelImportDialog", () => {
  it("keeps import inside the draft wizard and requires replacement confirmation", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn().mockResolvedValue({ canApply: true, lines: [{ sku: "ET-015025" }], waves: [], diagnostics: [], checksum: "abc", importSessionId: "session-1", brand: { code: "ET", name: "Etiaxil" }, planningYear: 2026 });
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<ExcelImportDialog open revisionId="90000000-0000-4000-8000-000000000302" lockVersion={3} onClose={vi.fn()} onPreview={onPreview} onApply={onApply} />);
    const input = screen.getByLabelText("File Excel kế hoạch");
    const file = new File(["xlsx"], "plan.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await user.upload(input, file);
    expect(await screen.findByText("ET-015025")).toBeVisible();
    expect(screen.getByRole("button", { name: "Áp dụng thay thế" })).toBeDisabled();
    await user.click(screen.getByLabelText("Tôi xác nhận thay thế dữ liệu SKU và đợt mua trong bản nháp"));
    expect(screen.getByRole("button", { name: "Áp dụng thay thế" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Áp dụng thay thế" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ importSessionId: "session-1", replaceSections: ["lines", "waves"] }));
  });
});
