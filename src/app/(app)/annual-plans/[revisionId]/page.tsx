import { PageHeader } from "@/components/ui/page-header";
import { AnnualPlanWizard } from "@/features/annual-plans/components/annual-plan-wizard";
import { loadAnnualPlan, loadAnnualPlanReview, type AnnualPlanStep } from "@/features/annual-plans/server/load-annual-plan";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";

interface AnnualPlanRevisionPageProps { params: Promise<{ revisionId: string }>; searchParams: Promise<{ step?: string | string[] }> }
function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }

export default async function AnnualPlanRevisionPage({ params, searchParams }: AnnualPlanRevisionPageProps) {
  const { revisionId } = await params;
  const query = await searchParams;
  const plan = await loadAnnualPlan(revisionId);
  if (!plan) return <div className="page-shell"><PageHeader eyebrow="Lập kế hoạch" title="Kế hoạch không khả dụng" description="Kế hoạch không tồn tại hoặc bạn không được cấp quyền xem." /><section className="empty-state"><h2>Không thể mở bản kế hoạch này.</h2></section></div>;
  const requestedStep = first(query.step) as AnnualPlanStep | undefined;
  const initialStep = requestedStep && plan.allowedSteps.includes(requestedStep) ? requestedStep : (plan.allowedSteps[0] ?? "scope");
  const reviewData = initialStep === "review" ? await loadAnnualPlanReview(revisionId) : undefined;
  const access = await getOrganizationContext();
  return <div className="page-shell annual-plan-page"><PageHeader eyebrow="Lập kế hoạch · Bản nháp" title={`Kế hoạch ${plan.scope.brand?.code ?? ""} · ${plan.scope.planningYear ?? ""}`} description="Bản nháp chỉ hiển thị với chủ sở hữu cho đến khi gửi phê duyệt." context={<span className="status-badge status-badge--neutral">{plan.revision.status === "draft_owner_only" ? "Bản nháp" : "Đang xử lý"}</span>} /><AnnualPlanWizard revisionId={revisionId} lockVersion={plan.revision.lockVersion} initialStep={initialStep} brands={plan.brands} authorizedBrandIds={plan.brands.map((brand) => brand.id)} planningYears={plan.planningYears} currentYear={new Date().getFullYear()} initialScope={{ brandId: plan.scope.brand?.id ?? "", planningYear: plan.scope.planningYear ?? new Date().getFullYear() }} allowedSteps={plan.allowedSteps} products={plan.products} initialLines={plan.initialLines} initialWaves={plan.initialWaves} reviewData={reviewData ?? undefined} canCreateBrand={Boolean(access?.isAdministrator || access?.capabilities.includes("create_annual_plan") || access?.capabilities.includes("manage_master_data") || access?.brands.some((brand) => brand.capabilities.includes("manage_master_data")))} /></div>;
}
