import type { PlanningRowView } from "@/features/planning/planning-types";

interface StockAlertProps {
  row: PlanningRowView;
  canEdit: boolean;
  onCreateProposal(row: PlanningRowView): void;
}
export function StockAlert({ row, canEdit, onCreateProposal }: StockAlertProps) {
  return (
    <section className="stock-alert" aria-label={`Cảnh báo ${row.sku}`}>
      <div className="stock-alert__signal">
        <span className="status-badge status-badge--critical">Critical</span>
        <strong>{row.projectedStock.toLocaleString("vi-VN")}</strong>
        <small>Tồn dự kiến cuối kỳ</small>
      </div>
      <div className="stock-alert__copy">
        <p className="section-index">Ưu tiên xử lý</p>
        <h2>
          {row.sku} dự kiến thiếu {row.recommendedQty.toLocaleString("vi-VN")}{" "}
          sản phẩm
        </h2>
        <p>
          Sản phẩm vẫn active nhưng chưa có PO tương lai. Đề xuất bổ sung tối
          thiểu {row.recommendedQty.toLocaleString("vi-VN")} sản phẩm để đưa tồn
          cuối kỳ về ngưỡng an toàn.
        </p>
      </div>
      <button
        className="button button--primary"
        type="button"
        disabled={!canEdit}
        onClick={() => onCreateProposal(row)}
      >
        Tạo PO đề xuất {row.recommendedQty.toLocaleString("vi-VN")}
      </button>
    </section>
  );
}
