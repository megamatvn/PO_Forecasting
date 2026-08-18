import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ProposalForm } from "@/features/proposals/components/proposal-form";
import { loadProposalCreationOptions } from "@/features/proposals/server/load-proposals";

interface PageProps { searchParams: Promise<{ brandId?: string }> }
export default async function NewProposalPage({ searchParams }: PageProps) {
  const query = await searchParams; const options = await loadProposalCreationOptions(query.brandId);
  return <div className="page-shell proposals-page"><PageHeader breadcrumb={[{ label: "Đề xuất mua hàng", href: "/proposals" }, { label: "Tạo mới" }]} title="Tạo đề xuất mua hàng" description="Gửi nhu cầu bổ sung theo SKU và tháng cần hàng; người duyệt sẽ ghi nhận vào một PO cụ thể." actions={<Link className="button button--secondary" href="/proposals">Quay lại danh sách</Link>} />{options.brands.length ? <ProposalForm brands={options.brands} products={options.products} productsByBrand={options.productsByBrand} currentYear={new Date().getFullYear()} /> : <section className="empty-state"><h2>Chưa có nhãn hàng được cấp quyền đề xuất.</h2><p>Hãy liên hệ Administrator để được gán phạm vi nhãn hàng.</p></section>}</div>;
}
