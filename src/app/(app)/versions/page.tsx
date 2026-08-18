import { PageHeader } from "@/components/ui/page-header";
import { VersionHistory, type VersionHistoryRow } from "@/features/versions/components/version-history";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface VersionRow {
  id: string;
  planning_cycle_id: string;
  version_number: number;
  status: string;
  created_at: string;
}

interface CycleRow {
  id: string;
  code: string;
  name: string;
  brand_id: string;
  planning_year: number;
}

interface BrandRow {
  id: string;
  code: string;
  name: string;
}

export default async function VersionsIndexPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("plan_versions")
    .select("id, planning_cycle_id, version_number, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const versions = (data ?? []) as VersionRow[];
  const cycleIds = [...new Set(versions.map((version) => version.planning_cycle_id))];
  const cycleResult = cycleIds.length
    ? await supabase
      .from("planning_cycles")
        .select("id, code, name, brand_id, planning_year")
        .in("id", cycleIds)
    : { data: [] };
  const cycleRows = (cycleResult.data ?? []) as CycleRow[];
  const cycles = new Map(
    cycleRows.map(
      (cycle) => [cycle.id, cycle],
    ),
  );
  const brandIds = [...new Set([...cycles.values()].map((cycle) => cycle.brand_id))];
  const brandResult = brandIds.length
    ? await supabase.from("brands").select("id, code, name").in("id", brandIds)
    : { data: [] };
  const brandRows = (brandResult.data ?? []) as BrandRow[];
  const brands = new Map(
    brandRows.map((brand) => [brand.id, brand]),
  );
  const historyRows: VersionHistoryRow[] = versions.flatMap((version) => {
    const cycle = cycles.get(version.planning_cycle_id) as CycleRow | undefined;
    const brand = cycle ? brands.get(cycle.brand_id) : undefined;
    if (!cycle || !brand) return [];
    return [{
      id: version.id,
      cycleCode: cycle.code,
      cycleName: cycle.name,
      brandCode: brand.code,
      brandName: brand.name,
      planningYear: cycle.planning_year,
      versionNumber: version.version_number,
      status: version.status as VersionHistoryRow["status"],
      createdAt: version.created_at,
    }];
  });

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Quản lý phiên bản"
        title="Lịch sử phiên bản"
        description="Theo dõi các lần thay đổi và trạng thái của kế hoạch mua hàng."
        context={<span className="status-badge status-badge--neutral">
          {versions.length.toLocaleString("vi-VN")} phiên bản
        </span>}
      />
      {versions.length === 0 ? (
        <section className="empty-state">
          <p className="section-index">Chưa có lịch sử</p>
          <h2>Phiên bản sẽ xuất hiện sau khi kế hoạch được tạo.</h2>
        </section>
      ) : <VersionHistory versions={historyRows} />}
    </div>
  );
}
