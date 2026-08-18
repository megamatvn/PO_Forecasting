import Link from "next/link";
import type { DashboardExceptionDTO } from "../contracts";

const severityLabels = { critical: "Khẩn cấp", warning: "Cảnh báo", info: "Thông tin" } as const;

export function ExceptionList({ exceptions }: { exceptions: DashboardExceptionDTO[] }) {
  return (
    <section className="v2-dashboard-panel v2-dashboard-exceptions" aria-label="Ngoại lệ cần lưu ý">
      <div className="v2-dashboard-panel__header">
        <div>
          <p className="section-index">Rủi ro & cấu hình</p>
          <h2>Ngoại lệ cần lưu ý</h2>
        </div>
        <span>{exceptions.length ? `${exceptions.length} mục` : "Ổn định"}</span>
      </div>
      {exceptions.length ? (
        <ul className="v2-dashboard-exception-list">
          {exceptions.map((exception) => <li key={exception.id} data-severity={exception.severity}><span className="v2-dashboard-exception-list__severity">{severityLabels[exception.severity]}</span><div><Link href={exception.href}>{exception.title}</Link><p>{exception.detail}</p></div></li>)}
        </ul>
      ) : <div className="v2-dashboard-empty"><strong>Chưa có ngoại lệ đáng chú ý.</strong><p>Các rủi ro về PO, đề xuất vượt kế hoạch và cấu hình sẽ được cập nhật tự động.</p></div>}
    </section>
  );
}
