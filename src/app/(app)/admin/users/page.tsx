import { PageHeader } from "@/components/ui/page-header";
import { OrganizationAccessManager, type OrganizationUserDTO } from "@/features/organization/components/organization-access-manager";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function UsersAdminPage() {
  const access = await getOrganizationContext();
  const canAdminister = Boolean(access?.isAdministrator);
  let users: OrganizationUserDTO[] = [];

  if (access && canAdminister) {
    const supabase = await createServerSupabaseClient();
    const usersResult = await supabase.rpc("list_manageable_users_v2");
    users = ((usersResult.data ?? []) as Record<string, unknown>[]).map((user) => ({
      id: String(user.id ?? user.user_id), displayName: String(user.display_name ?? ""), isActive: Boolean(user.is_active), tier: user.tier as OrganizationUserDTO["tier"], supervisorId: (user.supervisor_id as string | null) ?? null,
      capabilities: (user.capabilities ?? []) as OrganizationUserDTO["capabilities"], directBrands: (user.direct_brands ?? []) as OrganizationUserDTO["directBrands"], inheritedBrands: ((user.inherited_brands ?? []) as Record<string, unknown>[]).map((brand) => ({ id: String(brand.id), code: String(brand.code), name: String(brand.name), sourceUserName: String(brand.sourceUserName ?? brand.source_user_name ?? brand.sourceUserId ?? "Không rõ") })), subordinateCount: Number(user.subordinate_count ?? 0),
    }));
  }

  return (
    <div className="page-shell users-admin-page">
      <PageHeader
        eyebrow="Quản trị · Tổ chức & phân quyền"
        title="Người dùng & quyền"
        description="Quản lý cấp tổ chức, người phụ trách, năng lực và phạm vi nhãn hàng của từng tài khoản."
      />
      {access && canAdminister ? (
        <OrganizationAccessManager users={users} brands={access.brands} supervisors={users} />
      ) : (
        <section className="empty-state"><h2>Bạn không có quyền quản trị người dùng.</h2></section>
      )}
    </div>
  );
}
