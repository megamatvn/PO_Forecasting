import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateAccountDialog } from "@/features/organization/components/create-account-dialog";

describe("CreateAccountDialog", () => {
  it("accepts only email prefix and sends the Sagen email", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateAccountDialog supervisors={[]} onCreate={onCreate} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    await user.type(screen.getByLabelText("Tiền tố email"), "new.user");
    await user.type(screen.getByLabelText("Tên hiển thị"), "Người dùng mới");
    await user.type(screen.getByLabelText("Mật khẩu khởi tạo"), "Sagen@123456");
    await user.selectOptions(screen.getByLabelText("Cấp tổ chức"), "employee_viewer");
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản mới" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ email: "new.user@sagen-groupe.com", displayName: "Người dùng mới", password: "Sagen@123456", tier: "employee_viewer" }));
    expect(screen.queryByText("Sagen@123456")).not.toBeInTheDocument();
  });
});
