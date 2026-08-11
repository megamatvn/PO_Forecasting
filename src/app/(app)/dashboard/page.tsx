export default function DashboardPlaceholderPage() {
  return (
    <section className="page-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ETX · Planning cycle 2026</p>
          <h1>Tổng quan kế hoạch mua hàng</h1>
        </div>
        <span className="status-badge status-badge--neutral">Draft workspace</span>
      </header>

      <div className="empty-state">
        <p className="section-index">Dashboard đang được kết nối</p>
        <h2>Nguồn dữ liệu chính thức đã sẵn sàng.</h2>
        <p>
          Các KPI, cảnh báo tồn kho và lịch PO sẽ xuất hiện tại đây sau khi hoàn tất workspace.
        </p>
      </div>
    </section>
  );
}
