import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { MasterDataManager } from "@/features/master-data/components/master-data-manager";
import { loadBrandOptions } from "@/features/master-data/server/load-master-data";

export default async function MasterDataBrandsPage() {
  const access = await getOrganizationContext();
  const brands = access?.isAdministrator ? await loadBrandOptions(true) : [];
  if (!access?.isAdministrator) return <div className="page-shell"><PageHeader eyebrow="Dữ liệu nền" title="Nhãn hàng" description="Bạn chưa được cấp quyền quản trị dữ liệu nền." /><section className="empty-state"><h2>Không có quyền truy cập.</h2></section></div>;
  return <div className="page-shell master-data-page"><PageHeader eyebrow="Dữ liệu nền" title="Nhãn hàng & SKU" description="Quản lý danh mục dùng chung cho các kế hoạch mua hàng." /><MasterDataManager initialBrands={brands} initialProducts={[]} /></div>;
}
