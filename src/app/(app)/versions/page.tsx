import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface VersionRow {
  id: string;
  planning_cycle_id: string;
  version_number: number;
  status: string;
  created_at: string;
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
        .select("id, code, name")
        .in("id", cycleIds)
    : { data: [] };
  const cycles = new Map(
    ((cycleResult.data ?? []) as { id: string; code: string; name: string }[]).map(
      (cycle) => [cycle.id, cycle],
    ),
  );

  return (
    <div className="page-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Audit · Version control</p>
          <h1>Lịch sử phiên bản</h1>
        </div>
        <span className="status-badge status-badge--neutral">
          {versions.length.toLocaleString("vi-VN")} phiên bản
        </span>
      </header>
      {versions.length === 0 ? (
        <section className="empty-state">
          <p className="section-index">Chưa có lịch sử</p>
          <h2>Phiên bản sẽ xuất hiện sau khi kế hoạch được tạo.</h2>
        </section>
      ) : (
        <div className="version-list">
          {versions.map((version) => {
            const cycle = cycles.get(version.planning_cycle_id);
            return (
              <Link key={version.id} href={`/versions/${version.id}`}>
                <div>
                  <span>{cycle?.code ?? "Planning"}</span>
                  <strong>Version {version.version_number}</strong>
                </div>
                <p>{cycle?.name ?? "Kế hoạch mua hàng"}</p>
                <small>{version.status}</small>
                <time dateTime={version.created_at}>
                  {new Intl.DateTimeFormat("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    timeZone: "Asia/Ho_Chi_Minh",
                  }).format(new Date(version.created_at))}
                </time>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
