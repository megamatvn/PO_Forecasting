import { UserAccessManager, type ManagedUserAccess } from "@/features/admin/components/user-access-manager";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { canPerform, type AppRole } from "@/features/auth/permissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function UsersAdminPage() {
  const access = await getCurrentAccess();
  const canAdminister = access
    ? canPerform(new Set(access.roles), "administer")
    : false;
  let users: ManagedUserAccess[] = [];

  if (access && canAdminister) {
    const supabase = await createServerSupabaseClient();
    const usersResult = await supabase.rpc("list_manageable_user_access");
    users = ((usersResult.data ?? []) as {
      user_id: string;
      display_name: string;
      is_active: boolean;
      roles: AppRole[];
      brand_ids: string[];
    }[]).map((user) => ({
      id: user.user_id,
      displayName: user.display_name,
      isActive: user.is_active,
      roles: user.roles,
      brandIds: user.brand_ids,
    }));
  }

  return (
    <div className="page-shell users-admin-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administration · Access control</p>
          <h1>Người dùng & quyền</h1>
          <p className="page-heading__copy">
            Tài khoản được tạo hoặc mời trong Supabase Auth; tại đây Administrator gán vai trò và phạm vi nhãn hàng.
          </p>
        </div>
        <span className="status-badge status-badge--neutral">Atomic · RLS protected</span>
      </header>
      {access && canAdminister ? (
        <UserAccessManager users={users} brands={access.brands} />
      ) : (
        <section className="empty-state"><h2>Bạn không có quyền quản trị người dùng.</h2></section>
      )}
    </div>
  );
}
