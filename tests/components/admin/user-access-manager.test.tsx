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

    await user.click(screen.getByLabelText("Approver L1"));
    await user.click(screen.getByLabelText("ABC · ABC"));
    await user.click(screen.getByRole("button", { name: "Lưu quyền truy cập" }));

    expect(onSave).toHaveBeenCalledWith({
      userId: "user-1",
      roles: ["planner", "approver_l1"],
      brandIds: ["brand-etx", "brand-abc"],
      isActive: true,
    });
  });
});
