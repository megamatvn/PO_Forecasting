import { PolicyEditor } from "@/features/approvals/components/policy-editor";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { canPerform } from "@/features/auth/permissions";

export default async function ApprovalPoliciesPage() {
  const access = await getCurrentAccess();
  const canAdminister = access
    ? canPerform(new Set(access.roles), "administer")
    : false;

  return (
    <div className="page-shell policy-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administration · Approval</p>
          <h1>Chính sách duyệt</h1>
          <p className="page-heading__copy">
            Cấu hình hai cấp bắt buộc hoặc theo hạn mức cho một hay nhiều nhãn
            hàng cùng lúc.
          </p>
        </div>
        <span className="status-badge status-badge--neutral">
          Mặc định: 2 cấp
        </span>
      </header>
      {access && canAdminister ? (
        <PolicyEditor brands={access.brands} />
      ) : (
        <section className="empty-state">
          <p className="section-index">Không có quyền quản trị</p>
          <h2>Bạn không thể thay đổi chính sách duyệt.</h2>
          <p>Liên hệ Administrator nếu cần cập nhật cấu hình này.</p>
        </section>
      )}
    </div>
  );
}
