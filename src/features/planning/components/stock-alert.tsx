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
        <span className="status-badge status-badge--critical">Khẩn cấp</span>
        <strong>{row.projectedStock.toLocaleString("vi-VN")}</strong>
        <small>Tồn dự kiến cuối kỳ</small>
      </div>
      <div className="stock-alert__copy">
        <p className="section-index">Ưu tiên xử lý</p>
        <h2>
          {row.sku} cần bổ sung {row.recommendedQty.toLocaleString("vi-VN")}{" "}
          sản phẩm
        </h2>
        <p>
          Nhu cầu dự kiến đang vượt lượng hàng có thể đáp ứng. Kiểm tra đề xuất
          mua và lịch hàng về trước khi gửi duyệt.
        </p>
      </div>
      <button
        className="button button--primary"
        type="button"
        disabled={!canEdit}
        onClick={() => onCreateProposal(row)}
      >
        Tạo đề xuất mua
      </button>
    </section>
  );
}
