import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ProposalList } from "@/features/proposals/components/proposal-list";
import { loadProposalList } from "@/features/proposals/server/load-proposals";

export default async function ProposalsPage() {
  const proposals = await loadProposalList();
  return <div className="page-shell proposals-page"><PageHeader breadcrumb={[{ label: "Đề xuất mua hàng" }]} title="Đề xuất mua hàng" description="Theo dõi nhu cầu bổ sung, PO ghi nhận và tuyến phê duyệt." actions={<Link className="button" href="/proposals/new">Tạo đề xuất</Link>} /><ProposalList proposals={proposals} /></div>;
}
