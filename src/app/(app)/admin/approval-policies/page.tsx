import { PageHeader } from "@/components/ui/page-header";
import { ProposalPolicyEditor } from "@/features/approvals/components/proposal-policy-editor";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { canPerform } from "@/features/auth/permissions";

export default async function ApprovalPoliciesPage() {
  const access = await getCurrentAccess();
  const canAdminister = access
    ? canPerform(new Set(access.roles), "administer")
    : false;

  return (
    <div className="page-shell policy-page">
      <PageHeader
        eyebrow="Quản trị · Phê duyệt"
        title="Chính sách duyệt"
        description="Thiết lập tuyến duyệt hai cấp bắt buộc hoặc theo hạn mức cho một hay nhiều nhãn hàng."
        context={<span className="status-badge status-badge--neutral">
          Mặc định: 2 cấp
        </span>}
      />
      {access && canAdminister ? (
        <ProposalPolicyEditor brands={access.brands} />
      ) : (
        <section className="empty-state">
          <p className="section-index">Không có quyền quản trị</p>
          <h2>Bạn không thể thay đổi chính sách duyệt.</h2>
          <p>Liên hệ quản trị viên nếu cần cập nhật cấu hình này.</p>
        </section>
      )}
    </div>
  );
}
