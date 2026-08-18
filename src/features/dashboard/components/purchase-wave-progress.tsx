import Link from "next/link";
import type { DashboardWaveDTO } from "../contracts";

const statusLabels: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  ordered: "Đã đặt hàng",
  supplier_confirmed: "Nhà cung cấp xác nhận",
  received: "Đã nhận hàng",
  cancelled: "Đã hủy",
};

export function PurchaseWaveProgress({ waves }: { waves: DashboardWaveDTO[] }) {
  return (
    <section className="v2-dashboard-panel v2-dashboard-waves" aria-label="Tiến độ đợt mua">
      <div className="v2-dashboard-panel__header">
        <div>
          <p className="section-index">Đợt mua & ngày hàng về</p>
          <h2>Tiến độ đợt mua</h2>
        </div>
        <Link className="v2-dashboard-panel__link" href="/purchase-waves">Xem tất cả</Link>
      </div>
      {waves.length ? (
        <ul className="v2-dashboard-wave-list">
          {waves.map((wave) => (
            <li key={wave.id}>
              <div className="v2-dashboard-wave-list__title"><Link href={`/purchase-waves/${encodeURIComponent(wave.id)}`}>{wave.name}</Link><span>{wave.officialPoNumber ?? "Chưa có số PO chính thức"}</span></div>
              <div className="v2-dashboard-wave-list__bar"><span style={{ width: `${wave.progress}%` }} /></div>
              <div className="v2-dashboard-wave-list__meta"><span>{wave.usedUnits.toLocaleString("vi-VN")} / {wave.plannedUnits.toLocaleString("vi-VN")} sản phẩm</span><strong>{wave.progress}%</strong><span>{statusLabels[wave.status] ?? wave.status} · hàng về {wave.arrivalMonth}</span></div>
            </li>
          ))}
        </ul>
      ) : <div className="v2-dashboard-empty"><strong>Chưa có đợt mua trong baseline đã duyệt.</strong><p>Khi kế hoạch được duyệt và có PO, tiến độ sẽ xuất hiện tại đây.</p></div>}
    </section>
  );
}
