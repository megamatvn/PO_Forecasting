import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { canPerform } from "@/features/auth/permissions";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { CreateRevisionButton } from "@/features/versions/components/create-revision-button";
import { VersionDiff } from "@/features/versions/components/version-diff";
import type { PlanDiff } from "@/features/versions/domain/diff-plan";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface VersionPageProps {
  params: Promise<{ versionId: string }>;
}

interface VersionRow {
  id: string;
  planning_cycle_id: string;
  parent_version_id: string | null;
  version_number: number;
  status: string;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  draft: "Bản nháp",
  submitted: "Đã gửi duyệt",
  review_l1: "Chờ cấp 1",
  review_l2: "Chờ cấp 2",
  approved: "Đã duyệt",
  changes_requested: "Yêu cầu sửa",
  superseded: "Đã thay thế",
};

export default async function VersionPage({ params }: VersionPageProps) {
  const { versionId } = await params;
  const [supabase, access] = await Promise.all([
    createServerSupabaseClient(),
    getCurrentAccess(),
  ]);
  if (!access) notFound();
  const { data, error } = await supabase
    .from("plan_versions")
    .select(
      "id, planning_cycle_id, parent_version_id, version_number, status, created_at",
    )
    .eq("id", versionId)
    .maybeSingle();
  if (error || !data) notFound();
  const version = data as VersionRow;

  const [cycleResult, parentResult, diffResult] = await Promise.all([
    supabase
      .from("planning_cycles")
      .select("code, name")
      .eq("id", version.planning_cycle_id)
      .maybeSingle(),
    version.parent_version_id
      ? supabase
          .from("plan_versions")
          .select("version_number")
          .eq("id", version.parent_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("version_diffs")
      .select("diff_data, created_at")
      .eq("to_version_id", version.id)
      .maybeSingle(),
  ]);
  const diffs = (diffResult.data?.diff_data ?? []) as PlanDiff[];

  return (
    <div className="page-shell version-page">
      <PageHeader
        eyebrow={`${cycleResult.data?.code ?? "Kế hoạch"} · Lịch sử phiên bản`}
        title={`Phiên bản ${version.version_number}`}
        description={`${cycleResult.data?.name ?? "Kế hoạch mua hàng"} · Trạng thái ${statusLabels[version.status] ?? version.status}`}
        actions={<div className="version-page__actions">
          <span className="status-badge status-badge--neutral">Bản ghi bất biến</span>
          {version.status === "approved" || version.status === "changes_requested"
            ? canPerform(new Set(access.roles), "edit_plan")
              ? (
                <CreateRevisionButton
                  planVersionId={version.id}
                  cycleId={version.planning_cycle_id}
                />
              )
              : null
            : null}
        </div>}
      />
      <VersionDiff
        fromLabel={
          parentResult.data
            ? `Phiên bản ${parentResult.data.version_number}`
            : "Bản khởi tạo"
        }
        toLabel={`Phiên bản ${version.version_number}`}
        diffs={diffs}
      />
    </div>
  );
}
