import { PageHeader } from "@/components/ui/page-header";
import { AnnualPlanHistory, type AnnualPlanHistoryRevision } from "@/features/annual-plans/components/annual-plan-history";
import { CreateRevisionButton } from "@/features/annual-plans/components/create-revision-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface HistoryPageProps { params: Promise<{ revisionId: string }> }

const statusValues = ["draft_owner_only", "pending_executive", "approved", "changes_requested", "rejected", "superseded"] as const;

export default async function AnnualPlanHistoryPage({ params }: HistoryPageProps) {
  const { revisionId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: source } = await supabase.from("annual_plan_revisions").select("id, cycle_id, status, annual_plan_cycles(brand_id, planning_year, brands(code, name))").eq("id", revisionId).maybeSingle();
  if (!source) return <div className="page-shell"><PageHeader eyebrow="Lịch sử kế hoạch" title="Kế hoạch không khả dụng" description="Kế hoạch không tồn tại hoặc bạn không được cấp quyền xem." /></div>;
  const sourceRow = source as { id: string; cycle_id: string; status: string; annual_plan_cycles?: { planning_year?: number; brands?: { code?: string; name?: string } | Array<{ code?: string; name?: string }> } | Array<{ planning_year?: number; brands?: { code?: string; name?: string } }> };
  const cycle = Array.isArray(sourceRow.annual_plan_cycles) ? sourceRow.annual_plan_cycles[0] : sourceRow.annual_plan_cycles;
  const { data: rows } = await supabase.from("annual_plan_revisions").select("id, revision_number, status, owner_id, created_at, approved_at").eq("cycle_id", sourceRow.cycle_id).order("revision_number", { ascending: false });
  const revisionRows = (rows ?? []) as Array<{ id: string; revision_number: number; status: string; owner_id: string; created_at: string; approved_at: string | null }>;
  const ownerIds = [...new Set(revisionRows.map((row) => row.owner_id))];
  const { data: profiles } = ownerIds.length ? await supabase.from("profiles").select("id, display_name").in("id", ownerIds) : { data: [] };
  const profileMap = new Map(((profiles ?? []) as Array<{ id: string; display_name: string }>).map((profile) => [profile.id, profile.display_name]));
  const revisions: AnnualPlanHistoryRevision[] = revisionRows.flatMap((row) => statusValues.includes(row.status as typeof statusValues[number]) ? [{ id: row.id, revisionNumber: row.revision_number, status: row.status as AnnualPlanHistoryRevision["status"], ownerName: profileMap.get(row.owner_id) ?? "Người lập kế hoạch", createdAt: row.created_at, approvedAt: row.approved_at, approverName: null, changes: [] }] : []);
  const currentApproved = revisions.find((revision) => revision.status === "approved");
  return <div className="page-shell annual-plan-history-page"><PageHeader eyebrow="Theo dõi kế hoạch" title={`Lịch sử ${String((cycle?.brands && !Array.isArray(cycle.brands) ? cycle.brands.code : "") ?? "")} · ${Number(cycle?.planning_year ?? 0)}`} description="Các phiên bản được giữ nguyên để đối soát và tạo bản điều chỉnh có kiểm soát." context={<span className="status-badge status-badge--neutral">{revisions.length} phiên bản</span>} /><AnnualPlanHistory revisions={revisions} currentApprovedRevisionId={currentApproved?.id ?? null} showCreateAction={false} /><div className="annual-plan-history-page__action"><CreateRevisionButton revisionId={currentApproved?.id ?? ""} /></div></div>;
}
