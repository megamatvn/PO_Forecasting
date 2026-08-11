"use client";

import { useState } from "react";
import type { BrandAccess } from "@/features/auth/access-types";
import type { AppRole } from "@/features/auth/permissions";

export interface ManagedUserAccess {
  id: string;
  displayName: string;
  isActive: boolean;
  roles: AppRole[];
  brandIds: string[];
}

export interface UserAccessDraft {
  userId: string;
  roles: AppRole[];
  brandIds: string[];
  isActive: boolean;
}

interface UserAccessManagerProps {
  users: ManagedUserAccess[];
  brands: BrandAccess[];
  onSave?(draft: UserAccessDraft): Promise<void>;
}

const roleOptions: { value: AppRole; label: string; description: string }[] = [
  { value: "administrator", label: "Administrator", description: "Cấu hình người dùng, import và chính sách" },
  { value: "planner", label: "Planner", description: "Lập và gửi kế hoạch" },
  { value: "approver_l1", label: "Approver L1", description: "Duyệt nghiệp vụ cấp 1" },
  { value: "approver_l2", label: "Approver L2", description: "Phê duyệt cuối" },
  { value: "viewer", label: "Viewer", description: "Chỉ xem, export và audit" },
];

export function UserAccessManager({ users, brands, onSave }: UserAccessManagerProps) {
  const [managedUsers, setManagedUsers] = useState(users);
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");
  const selected = managedUsers.find((user) => user.id === selectedId) ?? managedUsers[0];
  const [draft, setDraft] = useState<UserAccessDraft | null>(
    selected
      ? { userId: selected.id, roles: selected.roles, brandIds: selected.brandIds, isActive: selected.isActive }
      : null,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function selectUser(userId: string) {
    const user = managedUsers.find((item) => item.id === userId);
    if (!user) return;
    setSelectedId(userId);
    setDraft({ userId, roles: user.roles, brandIds: user.brandIds, isActive: user.isActive });
    setMessage(null);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      if (onSave) {
        await onSave(draft);
      } else {
        const response = await fetch("/api/admin/users/access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...draft,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        if (!response.ok) throw new Error("user_access_save_failed");
      }
      setManagedUsers((current) => current.map((user) =>
        user.id === draft.userId
          ? {
              ...user,
              roles: draft.roles,
              brandIds: draft.brandIds,
              isActive: draft.isActive,
            }
          : user,
      ));
      setMessage("Đã lưu quyền truy cập.");
    } catch {
      setMessage("Không thể lưu quyền. Cấu hình cũ chưa bị thay đổi.");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return <section className="empty-state"><h2>Chưa có tài khoản Supabase.</h2></section>;
  }

  return (
    <div className="user-access-layout">
      <aside className="user-access-list" aria-label="Danh sách người dùng">
        {managedUsers.map((user) => (
          <button
            key={user.id}
            type="button"
            className={user.id === selectedId ? "is-active" : ""}
            onClick={() => selectUser(user.id)}
          >
            <strong>{user.displayName}</strong>
            <span>{user.roles.length} vai trò · {user.brandIds.length} nhãn hàng</span>
          </button>
        ))}
      </aside>
      <section className="user-access-editor">
        <header><p className="section-index">Quyền hiệu lực</p><h2>{selected?.displayName}</h2></header>
        <fieldset>
          <legend>Vai trò</legend>
          <div className="user-access-options">
            {roleOptions.map((role) => (
              <label key={role.value}>
                <input
                  type="checkbox"
                  aria-label={role.label}
                  checked={draft.roles.includes(role.value)}
                  onChange={(event) => setDraft((current) => current && ({
                    ...current,
                    roles: event.target.checked
                      ? [...current.roles, role.value]
                      : current.roles.filter((value) => value !== role.value),
                  }))}
                />
                <span><strong>{role.label}</strong><small>{role.description}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Nhãn hàng</legend>
          <div className="user-access-options user-access-options--brands">
            {brands.map((brand) => (
              <label key={brand.id}>
                <input
                  type="checkbox"
                  aria-label={`${brand.code} · ${brand.name}`}
                  checked={draft.brandIds.includes(brand.id)}
                  onChange={(event) => setDraft((current) => current && ({
                    ...current,
                    brandIds: event.target.checked
                      ? [...current.brandIds, brand.id]
                      : current.brandIds.filter((id) => id !== brand.id),
                  }))}
                />
                <span><strong>{brand.code}</strong><small>{brand.name}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="user-active-toggle">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => setDraft((current) => current && ({ ...current, isActive: event.target.checked }))}
          />
          Tài khoản được phép hoạt động
        </label>
        <footer>
          <span role="status">{message}</span>
          <button
            className="button button--primary"
            type="button"
            disabled={saving || draft.roles.length === 0 || draft.brandIds.length === 0}
            onClick={() => void save()}
          >
            {saving ? "Đang lưu…" : "Lưu quyền truy cập"}
          </button>
        </footer>
      </section>
    </div>
  );
}
