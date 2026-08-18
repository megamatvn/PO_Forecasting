import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { V2ApprovalWorkCenter } from "@/features/approvals/components/v2-approval-work-center";
import { loadV2ApprovalInbox } from "@/features/approvals/server/load-approval-inbox";

export default async function ApprovalsPage() {
  const access = await getOrganizationContext();
  const items = access ? await loadV2ApprovalInbox(access) : [];

  return (
    <div className="page-shell approvals-page">
      <PageHeader
        eyebrow="Trung tâm phê duyệt"
        title="Hồ sơ chờ duyệt"
        description="Xem nội dung, tuyến duyệt và xử lý các hồ sơ trong phạm vi được giao."
        context={<span className="status-badge status-badge--neutral">
          {items.length.toLocaleString("vi-VN")} hồ sơ
        </span>}
      />
      <V2ApprovalWorkCenter items={items} />
    </div>
  );
}
