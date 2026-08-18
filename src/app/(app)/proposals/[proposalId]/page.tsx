import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ProposalReview } from "@/features/proposals/components/proposal-review";
import { loadProposalForViewer } from "@/features/proposals/server/load-proposals";

interface PageProps { params: Promise<{ proposalId: string }> }
export default async function ProposalPage({ params }: PageProps) {
  const { proposalId } = await params; const proposal = await loadProposalForViewer(proposalId); if (!proposal) notFound();
  return <div className="page-shell proposals-page"><PageHeader breadcrumb={[{ label: "Đề xuất mua hàng", href: "/proposals" }, { label: proposal.brandCode }]} title="Chi tiết đề xuất" description="Kiểm tra SKU, chọn PO ghi nhận và hoàn tất đúng tuyến phê duyệt." actions={<Link className="button button--secondary" href="/proposals">Quay lại danh sách</Link>} /><ProposalReview proposal={proposal} /></div>;
}
