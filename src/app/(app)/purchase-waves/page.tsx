import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { loadRoleDashboard } from "@/features/dashboard/server/load-role-dashboard";

const statusLabels: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  ordered: "Đã đặt hàng",
  supplier_confirmed: "Nhà cung cấp xác nhận",
  received: "Đã nhận hàng",
  cancelled: "Đã hủy",
};

interface PurchaseWavesPageProps { searchParams: Promise<{ brandId?: string; planningYear?: string }> }

export default async function PurchaseWavesPage({ searchParams }: PurchaseWavesPageProps) {
  const access = await getOrganizationContext();
  if (!access) redirect("/login");
  const query = await searchParams;
  const currentYear = new Date().getFullYear();
  const requestedYear = Number(query.planningYear);
  const year = Number.isInteger(requestedYear) && requestedYear >= currentYear && requestedYear <= 2200 ? requestedYear : currentYear;
  const brandId = query.brandId && (access.isAdministrator || access.brands.some((brand) => brand.id === query.brandId)) ? query.brandId : access.brands[0]?.id ?? null;
  const dashboard = await loadRoleDashboard(access, brandId, year);
  return <div className="page-shell purchase-waves-page"><PageHeader breadcrumb={[{ label: "Kế hoạch & thực hiện" }, { label: "Đợt mua" }]} title="Đợt mua & ngày hàng về" description="Cập nhật số PO chính thức, ngày thực tế và theo dõi tiến độ so với kế hoạch." /><section className="v2-dashboard-panel" aria-label="Danh sách đợt mua"><div className="v2-dashboard-panel__header"><div><p className="section-index">Theo dõi vận hành</p><h2>Các đợt mua trong kế hoạch đã duyệt</h2></div><span>{dashboard.waves.length} đợt</span></div>{dashboard.waves.length ? <ul className="v2-wave-table">{dashboard.waves.map((wave) => <li key={wave.id}><div><Link href={`/purchase-waves/${encodeURIComponent(wave.id)}`}>{wave.name}</Link><span>{wave.officialPoNumber ?? "Chưa có số PO chính thức"}</span></div><span>Hàng về {wave.arrivalMonth}</span><strong>{wave.progress}%</strong><span>{statusLabels[wave.status] ?? wave.status}</span></li>)}</ul> : <div className="v2-dashboard-empty"><strong>Chưa có đợt mua được hiển thị.</strong><p>Chỉ các đợt thuộc baseline đã duyệt và phạm vi tài khoản mới xuất hiện.</p></div>}</section></div>;
}
