"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const rolePresentation: Record<AppRole, { label: string; description: string }> = {
  administrator: {
    label: "Quản trị hệ thống",
    description: "Quản lý người dùng, dữ liệu và chính sách",
  },
  planner: {
    label: "Lập kế hoạch",
    description: "Lập và gửi kế hoạch mua hàng",
  },
  approver_l1: {
    label: "Duyệt cấp 1",
    description: "Duyệt nghiệp vụ",
  },
  approver_l2: {
    label: "Duyệt cấp 2",
    description: "Phê duyệt cuối",
  },
  viewer: {
    label: "Chỉ xem",
    description: "Xem, xuất báo cáo và kiểm tra lịch sử",
  },
};

const roleOptions = (Object.entries(rolePresentation) as Array<
  [AppRole, (typeof rolePresentation)[AppRole]]
>).map(([value, presentation]) => ({ value, ...presentation }));

function sameAccess(left: ManagedUserAccess, right: ManagedUserAccess) {
  return (
    left.id === right.id &&
    left.displayName === right.displayName &&
    left.isActive === right.isActive &&
    left.roles.length === right.roles.length &&
    left.roles.every((role) => right.roles.includes(role)) &&
    left.brandIds.length === right.brandIds.length &&
    left.brandIds.every((brandId) => right.brandIds.includes(brandId))
  );
}

export function UserAccessManager({ users, brands, onSave }: UserAccessManagerProps) {
  const canonicalOverridesRef = useRef(new Map<string, ManagedUserAccess>());
  const [managedUsers, setManagedUsers] = useState(users);
  useEffect(() => {
    setManagedUsers(
      users.map((incoming) => {
        const canonical = canonicalOverridesRef.current.get(incoming.id);
        if (!canonical) return incoming;
        if (sameAccess(incoming, canonical)) {
          canonicalOverridesRef.current.delete(incoming.id);
          return incoming;
        }
        return canonical;
      }),
    );
  }, [users]);

  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");
  const selected = managedUsers.find((user) => user.id === selectedId) ?? managedUsers[0];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const visibleUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");
    return managedUsers.filter((user) => {
      const matchesSearch = !query || user.displayName.toLocaleLowerCase("vi-VN").includes(query);
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "active" ? user.isActive : !user.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [managedUsers, search, statusFilter]);
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
        user.id === draft.userId ? {
          ...user,
          roles: [...draft.roles],
          brandIds: [...draft.brandIds],
          isActive: draft.isActive,
        } : user,
      ));
      const currentUser = managedUsers.find((user) => user.id === draft.userId);
      if (currentUser) {
        canonicalOverridesRef.current.set(draft.userId, {
          ...currentUser,
          roles: [...draft.roles],
          brandIds: [...draft.brandIds],
          isActive: draft.isActive,
        });
      }
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
        <div className="user-access-list__filters">
          <label>
            Tìm người dùng
            <input
              type="search"
              aria-label="Tìm người dùng"
              placeholder="Tên hiển thị"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Trạng thái tài khoản
            <select
              aria-label="Trạng thái tài khoản"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
            >
              <option value="all">Tất cả tài khoản</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Đã tạm khóa</option>
            </select>
          </label>
          <span className="user-access-list__count" role="status">
            {visibleUsers.length.toLocaleString("vi-VN")} người dùng
          </span>
        </div>
        {visibleUsers.map((user) => (
          <button
            key={user.id}
            type="button"
            className={user.id === selectedId ? "is-active" : ""}
            aria-current={user.id === selectedId ? "true" : undefined}
            onClick={() => selectUser(user.id)}
          >
            <strong>{user.displayName}</strong>
            <span>{user.isActive ? "Đang hoạt động" : "Đã tạm khóa"} · {user.roles.length} vai trò · {user.brandIds.length} nhãn hàng</span>
          </button>
        ))}
        {visibleUsers.length === 0 ? <p className="user-access-list__empty">Không có người dùng phù hợp.</p> : null}
      </aside>
      <section className="user-access-editor">
        <header>
          <p className="section-index">Quyền hiệu lực</p>
          <h2>{selected?.displayName}</h2>
          <span className={`user-access-status ${selected?.isActive ? "is-active" : ""}`}>
            {selected?.isActive ? "Đang hoạt động" : "Đã tạm khóa"}
          </span>
        </header>
        <fieldset>
          <legend>Vai trò ({draft.roles.length})</legend>
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
          <legend>Nhãn hàng ({draft.brandIds.length})</legend>
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
