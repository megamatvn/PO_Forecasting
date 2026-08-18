import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { MasterDataManager } from "@/features/master-data/components/master-data-manager";
import { loadBrandOptions, loadProductOptions } from "@/features/master-data/server/load-master-data";

interface Props { searchParams: Promise<{ brandId?: string }> }
export default async function MasterDataProductsPage({ searchParams }: Props) {
  const access = await getOrganizationContext(); const params = await searchParams; const brands = access?.isAdministrator ? await loadBrandOptions(true) : (access?.brands ?? []).map((brand) => ({ id: brand.id, code: brand.code, name: brand.name, isActive: true })); const selectedBrandId = params.brandId && brands.some((brand) => brand.id === params.brandId) ? params.brandId : brands[0]?.id; const products = selectedBrandId ? await loadProductOptions(selectedBrandId, Boolean(access?.isAdministrator)) : [];
  if (!access) return <div className="page-shell"><PageHeader eyebrow="Dữ liệu nền" title="SKU" description="Phiên đăng nhập đã hết hạn." /><section className="empty-state"><h2>Vui lòng đăng nhập lại.</h2></section></div>;
  return <div className="page-shell master-data-page"><PageHeader eyebrow="Dữ liệu nền" title="SKU sản phẩm" description="SKU luôn được lọc theo nhãn hàng đang chọn để tránh nhập nhầm phạm vi." /><MasterDataManager initialBrands={brands} initialProducts={products} /></div>;
}
