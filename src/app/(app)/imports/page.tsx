import { ImportWorkflow } from "@/features/imports/components/import-workflow";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { canPerform } from "@/features/auth/permissions";

export default async function ImportsPage() {
  const access = await getCurrentAccess();
  const canAdminister = access
    ? canPerform(new Set(access.roles), "administer")
    : false;

  if (!access?.activeBrandId || !canAdminister) {
    return (
      <div className="page-shell">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Dữ liệu nguồn · Forecast 5M</p>
            <h1>Import Excel</h1>
          </div>
          <span className="status-badge status-badge--neutral">
            Chỉ quản trị viên
          </span>
        </header>
        <section className="empty-state">
          <p className="section-index">Quyền truy cập</p>
          <h2>Chưa thể mở vùng import</h2>
          <p>
            Tài khoản cần quyền quản trị và ít nhất một nhãn hàng đang hoạt
            động để thực hiện import dữ liệu.
          </p>
        </section>
      </div>
    );
  }

  const activeBrand = access.brands.find(
    (brand) => brand.id === access.activeBrandId,
  );

  return (
    <div className="page-shell import-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Dữ liệu nguồn · Forecast 5M</p>
          <h1>Import Excel</h1>
          <p className="page-heading__copy">
            Kiểm tra cấu trúc, quy đổi SKU và đối soát Amount trước khi tạo
            snapshot nguồn mới.
          </p>
        </div>
        <div className="import-brand-context">
          <span>Nhãn hàng đang chọn</span>
          <strong>{activeBrand?.code ?? "—"}</strong>
          <small>{activeBrand?.name ?? "Không xác định"}</small>
        </div>
      </header>

      <ImportWorkflow brandId={access.activeBrandId} />
    </div>
  );
}
