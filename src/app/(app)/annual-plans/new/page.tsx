import { PageHeader } from "@/components/ui/page-header";
import { AnnualPlanWizard } from "@/features/annual-plans/components/annual-plan-wizard";
import { loadAnnualPlan, type AnnualPlanStep } from "@/features/annual-plans/server/load-annual-plan";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";

interface NewAnnualPlanPageProps { searchParams: Promise<{ step?: string | string[]; brandId?: string | string[]; planningYear?: string | string[] }> }
function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }

export default async function NewAnnualPlanPage({ searchParams }: NewAnnualPlanPageProps) {
  const query = await searchParams;
  const access = await getOrganizationContext();
  const currentYear = new Date().getFullYear();
  const requestedYear = Number(first(query.planningYear));
  const plan = await loadAnnualPlan(undefined, first(query.brandId), Number.isInteger(requestedYear) ? requestedYear : undefined);
  if (!access || !plan) return <div className="page-shell"><PageHeader eyebrow="Lập kế hoạch" title="Tạo kế hoạch mua hàng" description="Tài khoản chưa có quyền tạo kế hoạch." /><section className="empty-state"><h2>Không thể mở biểu mẫu.</h2></section></div>;
  const requestedStep = first(query.step) as AnnualPlanStep | undefined;
  const initialStep = requestedStep && plan.allowedSteps.includes(requestedStep) ? requestedStep : "scope";
  return <div className="page-shell annual-plan-page"><PageHeader eyebrow="Lập kế hoạch · Kế hoạch năm" title="Tạo kế hoạch mua hàng" description="Hoàn thành từng bước để tạo bản nháp riêng tư trước khi gửi phê duyệt." context={<span className="status-badge status-badge--neutral">Bước 1/4</span>} /><AnnualPlanWizard initialStep={initialStep} brands={plan.brands} authorizedBrandIds={plan.brands.map((brand) => brand.id)} planningYears={plan.planningYears.filter((year) => year >= currentYear)} currentYear={currentYear} initialScope={{ brandId: plan.scope.brand?.id ?? "", planningYear: plan.scope.planningYear ?? currentYear }} allowedSteps={plan.allowedSteps} canCreateBrand={access.isAdministrator || access.capabilities.includes("create_annual_plan") || access.capabilities.includes("manage_master_data") || access.brands.some((brand) => brand.capabilities.includes("manage_master_data"))} /></div>;
}
