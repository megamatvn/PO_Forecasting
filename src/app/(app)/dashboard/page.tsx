import Link from "next/link";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import type { PurchaseBatchStatus } from "@/features/planning/contracts";
import { DashboardKpis } from "@/features/reports/components/dashboard-kpis";
import { PoTimeline } from "@/features/reports/components/po-timeline";
import { loadDashboard } from "@/features/reports/server/load-dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface DashboardPageProps {
  searchParams: Promise<{
    brandId?: string;
    cycleId?: string;
    status?: string;
    window?: string;
  }>;
}

interface CycleRow {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  planning_year: number;
}

const statuses = new Set<PurchaseBatchStatus>([
  "planned",
  "submitted",
  "confirmed",
  "received",
  "cancelled",
]);

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [access, query] = await Promise.all([getCurrentAccess(), searchParams]);
  const allowedBrandIds = access?.brands.map((brand) => brand.id) ?? [];
  const activeBrandId = allowedBrandIds.includes(query.brandId ?? "")
    ? query.brandId!
    : access?.activeBrandId;
  const supabase = await createServerSupabaseClient();
  const { data } = activeBrandId
    ? await supabase
        .from("planning_cycles")
        .select("id, brand_id, code, name, planning_year")
        .eq("brand_id", activeBrandId)
        .eq("is_active", true)
        .order("planning_year", { ascending: false })
    : { data: [] };
  const cycles = (data ?? []) as CycleRow[];
  const selectedCycle =
    cycles.find((cycle) => cycle.id === query.cycleId) ?? cycles[0];
  const status = statuses.has(query.status as PurchaseBatchStatus)
    ? (query.status as PurchaseBatchStatus)
    : "all";
  const days = query.window === "90" ? 90 : query.window === "180" ? 180 : null;
  const dashboard =
    access && selectedCycle
      ? await loadDashboard(selectedCycle.id, access, { status, days })
      : null;
  const criticalRows = dashboard?.plan.rows
    .filter((row) => row.severity === "critical")
    .sort((left, right) => right.recommendedQty - left.recommendedQty) ?? [];
  const topCritical = criticalRows[0];

  return (
    <div className="page-shell dashboard-page">
      <header className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">
            {selectedCycle?.code ?? "PO Forecasting"} · Executive workspace
          </p>
          <h1>Tổng quan kế hoạch mua hàng</h1>
          <p className="page-heading__copy">
            Một màn hình để thấy ngân sách, khoảng trống, thiếu hàng và lịch ETA.
          </p>
        </div>
        {dashboard ? (
          <a
            className="button button--primary"
            href={`/api/reports/export?versionId=${dashboard.plan.version.id}`}
          >
            Xuất Excel chuẩn
          </a>
        ) : null}
      </header>

      <form className="dashboard-filters" method="get">
        <label>
          <span>Nhãn hàng</span>
          <select name="brandId" defaultValue={activeBrandId ?? ""}>
            {access?.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.code} · {brand.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Chu kỳ</span>
          <select name="cycleId" defaultValue={selectedCycle?.id ?? ""}>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.code} · {cycle.planning_year}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Trạng thái PO</span>
          <select name="status" defaultValue={status}>
            <option value="all">Tất cả đang hoạt động</option>
            <option value="planned">Dự kiến</option>
            <option value="submitted">Đã gửi</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="received">Đã nhận</option>
            <option value="cancelled">Đã hủy</option>
          </select>
        </label>
        <label>
          <span>Khoảng ETA</span>
          <select name="window" defaultValue={query.window ?? "all"}>
            <option value="all">Toàn bộ</option>
            <option value="90">90 ngày gần nhất</option>
            <option value="180">180 ngày gần nhất</option>
          </select>
        </label>
        <button className="button" type="submit">Áp dụng bộ lọc</button>
      </form>

      {dashboard ? (
        <>
          <DashboardKpis
            currencyCode={dashboard.plan.cycle.currencyCode}
            kpis={dashboard.kpis}
          />
          {topCritical ? (
            <section className="dashboard-critical" aria-label="Ưu tiên Critical">
              <div>
                <p className="section-index">Ưu tiên cần hành động</p>
                <h2>{topCritical.sku} đang thiếu {topCritical.recommendedQty.toLocaleString("vi-VN")}</h2>
                <p>{topCritical.productName} vẫn active nhưng chưa được lên PO đủ theo forecast.</p>
              </div>
              <Link className="button button--primary" href={`/planning/${dashboard.plan.cycle.code}`}>
                Mở kế hoạch & bổ sung
              </Link>
            </section>
          ) : null}
          <PoTimeline
            currencyCode={dashboard.plan.cycle.currencyCode}
            batches={dashboard.batches}
          />
        </>
      ) : (
        <section className="empty-state">
          <p className="section-index">Chưa có dữ liệu trong phạm vi</p>
          <h2>Hãy import workbook và tạo Draft đầu tiên.</h2>
          <p>Dashboard chỉ hiển thị dữ liệu canonical mà tài khoản được cấp quyền.</p>
        </section>
      )}
    </div>
  );
}
