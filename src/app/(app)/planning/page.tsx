import Link from "next/link";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface CycleRow {
  id: string;
  code: string;
  name: string;
  planning_year: number;
  currency_code: string;
  target_purchase_amount: string;
}

export default async function PlanningIndexPage() {
  const access = await getCurrentAccess();
  const brandIds = access?.brands.map((brand) => brand.id) ?? [];
  const supabase = await createServerSupabaseClient();
  const { data } = brandIds.length
    ? await supabase
        .from("planning_cycles")
        .select(
          "id, code, name, planning_year, currency_code, target_purchase_amount",
        )
        .in("brand_id", brandIds)
        .eq("is_active", true)
        .order("planning_year", { ascending: false })
    : { data: [] };
  const cycles = (data ?? []) as CycleRow[];

  return (
    <div className="page-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Forecast Planning</p>
          <h1>Chu kỳ kế hoạch</h1>
          <p className="page-heading__copy">
            Chọn chu kỳ để mở workspace lập kế hoạch, tồn dự kiến và các PO đề
            xuất.
          </p>
        </div>
        <span className="status-badge status-badge--neutral">
          {cycles.length.toLocaleString("vi-VN")} chu kỳ
        </span>
      </header>

      {cycles.length === 0 ? (
        <section className="empty-state">
          <p className="section-index">Chưa có kế hoạch</p>
          <h2>Workspace sẽ xuất hiện sau lần import đầu tiên.</h2>
          <p>
            Quản trị viên cần tạo chu kỳ và Draft plan cho nhãn hàng trước khi
            Planner bắt đầu làm việc.
          </p>
        </section>
      ) : (
        <div className="cycle-list">
          {cycles.map((cycle) => (
            <Link key={cycle.id} href={`/planning/${cycle.code}`}>
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
