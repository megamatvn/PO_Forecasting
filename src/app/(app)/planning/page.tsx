import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { PoTimeline } from "@/features/reports/components/po-timeline";
import { loadDashboard } from "@/features/reports/server/load-dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface CycleRow {
  id: string;
  code: string;
  name: string;
  planning_year: number;
  currency_code: string;
  target_purchase_amount: string;
}

interface PlanningIndexPageProps {
  searchParams: Promise<{
    brandId?: string | string[];
    cycleId?: string | string[];
    step?: string | string[];
  }>;
}

export default async function PlanningIndexPage({
  searchParams,
}: PlanningIndexPageProps) {
  const query = await searchParams;
  const requestedBrandId = Array.isArray(query.brandId)
    ? query.brandId[0]
    : query.brandId;
  const access = await getCurrentAccess(requestedBrandId);
  const activeBrandId = access?.activeBrandId;
  const supabase = await createServerSupabaseClient();
  const { data } = activeBrandId
    ? await supabase
        .from("planning_cycles")
        .select(
          "id, code, name, planning_year, currency_code, target_purchase_amount",
        )
        .eq("brand_id", activeBrandId)
        .eq("is_active", true)
        .order("planning_year", { ascending: false })
    : { data: [] };
  const cycles = (data ?? []) as CycleRow[];
  const cycleId = Array.isArray(query.cycleId) ? query.cycleId[0] : query.cycleId;
  const selectedCycle = cycles.find((cycle) => cycle.id === cycleId) ?? cycles[0];
  const step = Array.isArray(query.step) ? query.step[0] : query.step;

  if (step === "po") {
    const dashboard = selectedCycle && access
      ? await loadDashboard(selectedCycle.id, access)
      : null;

    return (
      <div className="page-shell">
        <PageHeader
          eyebrow="Lập kế hoạch · Lịch cung ứng"
          title="Đợt mua & ngày hàng về"
          description="Theo dõi các đợt mua và thời điểm hàng về cho nhãn hàng đang chọn."
          context={selectedCycle ? (
            <span className="status-badge status-badge--neutral">
              {selectedCycle.code} · {selectedCycle.planning_year}
            </span>
          ) : null}
        />

        {dashboard ? (
          <PoTimeline
            currencyCode={dashboard.plan.cycle.currencyCode}
            batches={dashboard.batches}
          />
        ) : (
          <section className="empty-state">
            <p className="section-index">Chưa có lịch cung ứng</p>
            <h2>Chưa có chu kỳ kế hoạch cho nhãn hàng này.</h2>
            <p>Hãy chọn nhãn hàng có kế hoạch hoặc tạo bản nháp trước khi theo dõi PO.</p>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Lập kế hoạch"
        title="Kế hoạch mua hàng"
        description="Chọn chu kỳ để mở kế hoạch, xem tồn dự kiến và các PO đề xuất."
        context={<span className="status-badge status-badge--neutral">
          {cycles.length.toLocaleString("vi-VN")} chu kỳ
        </span>}
      />

      {cycles.length === 0 ? (
        <section className="empty-state">
          <p className="section-index">Chưa có kế hoạch</p>
          <h2>Kế hoạch sẽ xuất hiện sau lần import đầu tiên.</h2>
          <p>
            Quản trị viên cần tạo chu kỳ và bản nháp cho nhãn hàng trước khi
            người lập kế hoạch bắt đầu làm việc.
          </p>
        </section>
      ) : (
        <div className="cycle-list">
          {cycles.map((cycle) => (
            <Link key={cycle.id} href={`/planning/${cycle.code}?brandId=${activeBrandId}`}>
              <span>{cycle.planning_year}</span>
              <div>
                <strong>{cycle.code}</strong>
                <p>{cycle.name}</p>
              </div>
              <small>
                {new Intl.NumberFormat("vi-VN", {
                  style: "currency",
                  currency: cycle.currency_code,
                  maximumFractionDigits: 0,
                }).format(Number(cycle.target_purchase_amount))}
              </small>
              <b aria-hidden="true">→</b>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
