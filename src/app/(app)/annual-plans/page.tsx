import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { AnnualPlanCatalog } from "@/features/annual-plans/components/annual-plan-catalog";
import { loadAnnualPlanCatalog } from "@/features/annual-plans/server/load-annual-plan-catalog";

export default async function AnnualPlansPage() {
  const access = await getOrganizationContext();
  const catalog = await loadAnnualPlanCatalog();
  if (!access || !catalog) {
    return <div className="page-shell"><PageHeader eyebrow="Lập kế hoạch" title="Kế hoạch mua hàng" description="Không thể tải phạm vi kế hoạch của tài khoản." /><section className="empty-state"><h2>Chưa có quyền truy cập.</h2></section></div>;
  }
  return (
    <div className="page-shell annual-plans-page">
      <PageHeader eyebrow="Lập kế hoạch" title="Kế hoạch mua hàng" description="Tạo, tiếp tục và theo dõi kế hoạch theo từng nhãn hàng và năm kế hoạch." context={<span className="status-badge status-badge--neutral">{catalog.brands.length} nhãn hàng được cấp quyền</span>} />
      <AnnualPlanCatalog catalog={catalog} />
    </div>
  );
}
