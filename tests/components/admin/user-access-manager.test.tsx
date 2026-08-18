import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserAccessManager } from "@/features/admin/components/user-access-manager";

describe("UserAccessManager", () => {
  it("assigns multiple roles and brands in one save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <UserAccessManager
        users={[
          {
            id: "user-1",
            displayName: "Nguyễn An",
            isActive: true,
            roles: ["planner"],
            brandIds: ["brand-etx"],
          },
        ]}
        brands={[
          { id: "brand-etx", code: "ETX", name: "ETX" },
          { id: "brand-abc", code: "ABC", name: "ABC" },
        ]}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Quản trị hệ thống")).toBeVisible();
    expect(screen.getByText("Lập kế hoạch")).toBeVisible();
    expect(screen.getByText("Duyệt cấp 1")).toBeVisible();
    expect(screen.queryByText("Administrator")).not.toBeInTheDocument();
    expect(screen.queryByText("Planner")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Duyệt cấp 1"));
    await user.click(screen.getByLabelText("ABC · ABC"));
    await user.click(screen.getByRole("button", { name: "Lưu quyền truy cập" }));

    expect(onSave).toHaveBeenCalledWith({
      userId: "user-1",
      roles: ["planner", "approver_l1"],
      brandIds: ["brand-etx", "brand-abc"],
      isActive: true,
    });
  });

  it("filters users by search and active status while keeping the selected hierarchy clear", async () => {
    const user = userEvent.setup();
    render(
      <UserAccessManager
        users={[
          {
            id: "user-1",
            displayName: "Nguyễn An",
            isActive: true,
            roles: ["planner"],
            brandIds: ["brand-etx"],
          },
          {
            id: "user-2",
            displayName: "Trần Bình",
            isActive: false,
            roles: ["viewer"],
            brandIds: ["brand-abc"],
          },
        ]}
        brands={[
          { id: "brand-etx", code: "ETX", name: "ETX" },
          { id: "brand-abc", code: "ABC", name: "ABC" },
        ]}
      />,
    );

    await user.type(screen.getByLabelText("Tìm người dùng"), "Trần");
    expect(screen.getByRole("button", { name: /Trần Bình/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Nguyễn An/i })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Tìm người dùng"));
    await user.selectOptions(screen.getByLabelText("Trạng thái tài khoản"), "active");
    expect(screen.getByRole("button", { name: /Nguyễn An/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Trần Bình/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nguyễn An/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByText("Vai trò (1)")).toBeVisible();
    expect(screen.getByText("Nhãn hàng (1)")).toBeVisible();
  });

  it("keeps the saved canonical access when stale props arrive after save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const initialUsers = [
      {
        id: "user-1",
        displayName: "Nguyễn An",
        isActive: true,
        roles: ["planner" as const],
        brandIds: ["brand-etx"],
      },
    ];
    const { rerender } = render(
      <UserAccessManager
        users={initialUsers}
        brands={[{ id: "brand-etx", code: "ETX", name: "ETX" }]}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByLabelText("Duyệt cấp 1"));
    await user.click(screen.getByRole("button", { name: "Lưu quyền truy cập" }));
    rerender(
      <UserAccessManager
        users={initialUsers}
        brands={[{ id: "brand-etx", code: "ETX", name: "ETX" }]}
        onSave={onSave}
      />,
    );

    expect(screen.getByLabelText("Duyệt cấp 1")).toBeChecked();
  });
});
