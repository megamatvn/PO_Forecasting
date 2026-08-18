import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PurchaseWaveOperationForm } from "@/features/dashboard/components/purchase-wave-operation-form";

const statusLabels: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  ordered: "Đã đặt hàng",
  supplier_confirmed: "Nhà cung cấp xác nhận",
  received: "Đã nhận hàng",
  cancelled: "Đã hủy",
};

interface PurchaseWaveDetailProps { params: Promise<{ waveId: string }> }

export default async function PurchaseWaveDetailPage({ params }: PurchaseWaveDetailProps) {
  const access = await getOrganizationContext();
  if (!access) redirect("/login");
  const { waveId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: wave } = await supabase.from("v2_dashboard_purchase_waves").select("*").eq("wave_id", waveId).maybeSingle();
  if (!wave) notFound();
  const item = wave as Record<string, unknown>;
  return <div className="page-shell purchase-wave-detail-page"><PageHeader breadcrumb={[{ label: "Đợt mua", href: "/purchase-waves" }, { label: `PO #${String(item.wave_number ?? "")}` }]} title={`PO #${String(item.wave_number ?? "")}`} description="Cập nhật trạng thái thực tế nhưng luôn giữ lại tháng đặt và tháng hàng về theo kế hoạch để đối chiếu." /><section className="v2-dashboard-panel v2-wave-detail-summary" aria-label="Thông tin đợt mua"><div><span>Tháng đặt theo kế hoạch</span><strong>{String(item.order_month ?? "").slice(0, 7)}</strong></div><div><span>Tháng hàng về theo kế hoạch</span><strong>{String(item.arrival_month ?? "").slice(0, 7)}</strong></div><div><span>Đã sử dụng</span><strong>{Number(item.used_units ?? 0).toLocaleString("vi-VN")} / {Number(item.planned_units ?? 0).toLocaleString("vi-VN")}</strong></div><div><span>Trạng thái</span><strong>{statusLabels[String(item.status ?? "")] ?? String(item.status ?? "")}</strong></div></section><PurchaseWaveOperationForm waveId={waveId} status={String(item.status ?? "planned")} officialPoNumber={item.official_po_number == null ? null : String(item.official_po_number)} orderedAt={item.ordered_at == null ? null : String(item.ordered_at)} supplierConfirmedAt={item.supplier_confirmed_at == null ? null : String(item.supplier_confirmed_at)} receivedAt={item.received_at == null ? null : String(item.received_at)} /></div>;
}
