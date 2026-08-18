import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { RoleDashboard } from "@/features/dashboard/components/role-dashboard";
import { loadRoleDashboard } from "@/features/dashboard/server/load-role-dashboard";
interface DashboardPageProps { searchParams: Promise<{ brandId?: string; planningYear?: string }> }
const MAX_YEAR = 2200;

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const query = await searchParams;
  const access = await getOrganizationContext();
  if (!access) redirect("/login");
  const yearNow = new Date().getFullYear();
  const requestedYear = Number(query.planningYear);
  const planningYear = Number.isInteger(requestedYear) && requestedYear >= yearNow && requestedYear <= MAX_YEAR ? requestedYear : yearNow;
  const selectedBrandId = query.brandId && (access.isAdministrator || access.brands.some((brand) => brand.id === query.brandId)) ? query.brandId : access.brands[0]?.id ?? null;
  const dashboard = await loadRoleDashboard(access, selectedBrandId, planningYear);
  const planningYears = Array.from({ length: Math.min(6, MAX_YEAR - yearNow + 1) }, (_, index) => yearNow + index);

  return (
    <div className="page-shell dashboard-page">
      <PageHeader
        breadcrumb={[{ label: "Tổng quan" }, ...(dashboard.context.brandCode ? [{ label: dashboard.context.brandCode }] : [])]}
        title="Tổng quan vận hành"
        description="Nắm ngay việc cần xử lý, tiến độ các đợt mua và ngoại lệ trong phạm vi được cấp quyền."
      />
      <form className="v2-dashboard-context" method="get" aria-label="Phạm vi tổng quan">
        <div className="field-group"><label htmlFor="dashboard-brand">Nhãn hàng</label><select id="dashboard-brand" name="brandId" defaultValue={selectedBrandId ?? ""}><option value="">Tất cả nhãn hàng được cấp quyền</option>{access.brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.code} · {brand.name}</option>)}</select></div>
        <div className="field-group"><label htmlFor="dashboard-year">Năm kế hoạch</label><select id="dashboard-year" name="planningYear" defaultValue={String(planningYear)}>{planningYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
        <button className="button button--primary" type="submit">Áp dụng phạm vi</button>
      </form>
      <RoleDashboard data={dashboard} />
    </div>
  );
}
