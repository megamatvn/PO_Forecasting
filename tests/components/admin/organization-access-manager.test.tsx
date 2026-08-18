import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OrganizationAccessManager, type OrganizationUserDTO } from "@/features/organization/components/organization-access-manager";

const id = (n: string) => `90000000-0000-4000-8000-${n.padStart(12, "0")}`;
const brand = { id: id("101"), code: "ET", name: "Etiaxil" };
const activeLeader: OrganizationUserDTO = { id: id("1"), displayName: "Leader An", isActive: true, tier: "leader", supervisorId: null, capabilities: ["create_purchase_proposal"], directBrands: [], inheritedBrands: [], subordinateCount: 0 };
const executive: OrganizationUserDTO = { id: id("2"), displayName: "CEO Bình", isActive: true, tier: "executive", supervisorId: null, capabilities: [], directBrands: [], inheritedBrands: [], subordinateCount: 0 };

describe("OrganizationAccessManager", () => {
  it("requires one Manager when activating a Leader", async () => {
    const onSave = vi.fn();
    render(<OrganizationAccessManager users={[activeLeader]} supervisors={[]} onSave={onSave} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Lưu quyền truy cập" }));
    expect(await screen.findByText("Bắt buộc chọn người quản lý trực tiếp.")).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows direct and inherited brand permissions separately", () => {
    const manager: OrganizationUserDTO = { ...executive, id: id("3"), displayName: "Manager Mai", tier: "manager", supervisorId: executive.id, directBrands: [brand], inheritedBrands: [{ ...brand, sourceUserName: "Leader An" }] };
    render(<OrganizationAccessManager users={[manager, executive]} supervisors={[executive]} />);
    expect(screen.getByText("Được cấp trực tiếp")).toBeVisible();
    expect(screen.getByText("Kế thừa từ Leader An")).toBeVisible();
  });

  it("requires a replacement before deactivating a Manager with subordinates", async () => {
    const manager: OrganizationUserDTO = { ...executive, id: id("4"), displayName: "Manager Có đội", tier: "manager", supervisorId: executive.id, subordinateCount: 1 };
    const replacement: OrganizationUserDTO = { ...manager, id: id("5"), displayName: "Manager Thay thế", subordinateCount: 0 };
    render(<OrganizationAccessManager users={[manager, replacement, executive]} supervisors={[replacement, executive]} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Tài khoản đang hoạt động" }));
    expect(await screen.findByRole("dialog", { name: "Chọn người quản lý thay thế" })).toBeVisible();
  });

  it("submits the chosen replacement with the deactivation command", async () => {
    const manager: OrganizationUserDTO = { ...executive, id: id("7"), displayName: "Manager Có đội", tier: "manager", supervisorId: executive.id, subordinateCount: 1 };
    const replacement: OrganizationUserDTO = { ...manager, id: id("8"), displayName: "Manager Thay thế", subordinateCount: 0 };
    const onSave = vi.fn().mockResolvedValue({ ...manager, isActive: false });
    render(<OrganizationAccessManager users={[manager, replacement, executive]} supervisors={[replacement, executive]} onSave={onSave} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Tài khoản đang hoạt động" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Người quản lý thay thế" }), replacement.id);
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    await user.click(screen.getByRole("button", { name: "Lưu quyền truy cập" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, replacementUserId: replacement.id }));
  });

  it("reconciles the canonical response after save", async () => {
    const manager: OrganizationUserDTO = { ...executive, id: id("6"), displayName: "Manager Bình", tier: "manager", supervisorId: executive.id };
    const canonical = { ...manager, inheritedBrands: [{ ...brand, sourceUserName: "Leader Bình" }] };
    const onSave = vi.fn().mockResolvedValue(canonical);
    render(<OrganizationAccessManager users={[manager, executive]} supervisors={[executive]} onSave={onSave} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Lưu quyền truy cập" }));
    expect(await screen.findByText("Kế thừa từ Leader Bình")).toBeVisible();
  });
});
