import "server-only";

import type { CurrentAccessV2 } from "@/features/auth/access-types";
import {
  approvalWorkKindLabels,
  type ApprovalWorkItem,
  type ApprovalWorkLevel,
} from "@/features/approvals/contracts-v2";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RecordLike = Record<string, unknown>;

interface AnnualCaseRow {
  id: string;
  target_id: string;
  status: string;
  brand_id: string;
  submitted_by: string;
  assigned_executive_id: string | null;
  submitted_at: string;
}

interface ProposalRow {
  id: string;
  status: string;
  planning_year: number;
  assigned_manager_id: string | null;
  assigned_executive_id: string | null;
  updated_at: string;
  brands: unknown;
  profiles: unknown;
}

function record(value: unknown): RecordLike {
  return value && typeof value === "object" ? value as RecordLike : {};
}

function relation(value: unknown): RecordLike {
  return Array.isArray(value) ? record(value[0]) : record(value);
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function latestRevisionByProposal(rows: unknown[]): Map<string, string> {
  const latest = new Map<string, { id: string; number: number }>();
  for (const value of rows) {
    const row = record(value);
    const proposalId = text(row.proposal_id);
    const revisionId = text(row.id);
    if (!proposalId || !revisionId) continue;
    const candidate = { id: revisionId, number: Number(row.revision_number ?? 0) };
    const current = latest.get(proposalId);
    if (!current || candidate.number > current.number) latest.set(proposalId, candidate);
  }
  return new Map([...latest].map(([proposalId, revision]) => [proposalId, revision.id]));
}

/**
 * Loads the V2 approval queue from the V2 workflow and proposal sources only.
 * Each query binds the current user as assignee, and mapping repeats that check
 * so administrator-readable rows can never become decision work by accident.
 */
export async function loadV2ApprovalInbox(access: CurrentAccessV2): Promise<ApprovalWorkItem[]> {
  const supabase = await createServerSupabaseClient();
  const [annualResult, managerProposalResult, executiveProposalResult] = await Promise.all([
    supabase
      .from("workflow_approval_cases")
      .select("id,target_id,status,brand_id,submitted_by,assigned_executive_id,submitted_at")
      .eq("target_kind", "annual_plan")
      .eq("status", "pending")
      .eq("assigned_executive_id", access.userId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("purchase_proposals")
      .select("id,status,planning_year,assigned_manager_id,assigned_executive_id,updated_at,brands(code,name),profiles!purchase_proposals_owner_id_fkey(display_name)")
      .in("status", ["pending_manager", "cancellation_pending_manager"])
      .eq("assigned_manager_id", access.userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("purchase_proposals")
      .select("id,status,planning_year,assigned_manager_id,assigned_executive_id,updated_at,brands(code,name),profiles!purchase_proposals_owner_id_fkey(display_name)")
      .in("status", ["pending_executive", "cancellation_pending_executive"])
      .eq("assigned_executive_id", access.userId)
      .order("updated_at", { ascending: false }),
  ]);

  const annualCases = ((annualResult.data ?? []) as AnnualCaseRow[]).filter(
    (item) => item.assigned_executive_id === access.userId && item.status === "pending",
  );
  const managerProposals = ((managerProposalResult.data ?? []) as ProposalRow[]).filter(
    (item) => item.assigned_manager_id === access.userId
      && ["pending_manager", "cancellation_pending_manager"].includes(item.status),
  );
  const executiveProposals = ((executiveProposalResult.data ?? []) as ProposalRow[]).filter(
    (item) => item.assigned_executive_id === access.userId
      && ["pending_executive", "cancellation_pending_executive"].includes(item.status),
  );
  const proposals = [...managerProposals, ...executiveProposals];
  const proposalIds = [...new Set(proposals.map((item) => item.id))];

  const [annualDetails, proposalDetails] = await Promise.all([
    loadAnnualDetails(supabase, annualCases),
    loadProposalDetails(supabase, proposalIds),
  ]);

  const annualItems = annualCases.flatMap((item) => {
    const detail = annualDetails.get(item.target_id);
    if (!detail) return [];
    return [{
      id: item.id,
      kind: "annual_plan" as const,
      targetId: item.target_id,
      href: `/annual-plans/${item.target_id}?step=review`,
      title: approvalWorkKindLabels.annual_plan,
      submittedBy: detail.ownerName,
      submittedAt: item.submitted_at,
      brandCode: detail.brandCode,
      brandName: detail.brandName,
      planningYear: detail.planningYear,
      currentLevel: "executive" as const,
      assigneeId: access.userId,
      overPlan: false,
      assignedPoLabel: null,
    } satisfies ApprovalWorkItem];
  });
  const proposalItems = proposals.map((item) => proposalToWorkItem(item, access.userId, proposalDetails));
  return [...annualItems, ...proposalItems].sort(
    (left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime(),
  );
}

async function loadAnnualDetails(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  cases: AnnualCaseRow[],
) {
  if (!cases.length) return new Map<string, { planningYear: number; brandCode: string; brandName: string; ownerName: string }>();
  const revisionIds = cases.map((item) => item.target_id);
  const brandIds = [...new Set(cases.map((item) => item.brand_id))];
  const ownerIds = [...new Set(cases.map((item) => item.submitted_by))];
  const [{ data: revisions }, { data: brands }, { data: profiles }] = await Promise.all([
    supabase.from("annual_plan_revisions").select("id,cycle_id").in("id", revisionIds),
    supabase.from("brands").select("id,code,name").in("id", brandIds),
    supabase.from("profiles").select("id,display_name").in("id", ownerIds),
  ]);
  const cycleIds = ((revisions ?? []) as Array<{ cycle_id: string }>).map((item) => item.cycle_id);
  const { data: cycles } = cycleIds.length
    ? await supabase.from("annual_plan_cycles").select("id,planning_year").in("id", cycleIds)
    : { data: [] };
  const revisionToCycle = new Map(((revisions ?? []) as Array<{ id: string; cycle_id: string }>).map((item) => [item.id, item.cycle_id]));
  const cycleToYear = new Map(((cycles ?? []) as Array<{ id: string; planning_year: number }>).map((item) => [item.id, item.planning_year]));
  const brandsById = new Map(((brands ?? []) as Array<{ id: string; code: string; name: string }>).map((item) => [item.id, item]));
  const namesById = new Map(((profiles ?? []) as Array<{ id: string; display_name: string }>).map((item) => [item.id, item.display_name]));
  const details = new Map<string, { planningYear: number; brandCode: string; brandName: string; ownerName: string }>();
  for (const item of cases) {
    const brand = brandsById.get(item.brand_id);
    const planningYear = cycleToYear.get(revisionToCycle.get(item.target_id) ?? "");
    if (!brand || !planningYear) continue;
    details.set(item.target_id, {
      planningYear,
      brandCode: brand.code,
      brandName: brand.name,
      ownerName: namesById.get(item.submitted_by) ?? "Người lập kế hoạch",
    });
  }
  return details;
}

async function loadProposalDetails(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  proposalIds: string[],
) {
  if (!proposalIds.length) return new Map<string, { overPlan: boolean; assignedPoLabel: string | null }>();
  const { data: revisions } = await supabase
    .from("proposal_revisions")
    .select("id,proposal_id,revision_number")
    .in("proposal_id", proposalIds);
  const revisionByProposal = latestRevisionByProposal(revisions ?? []);
  const revisionIds = [...revisionByProposal.values()];
  if (!revisionIds.length) return new Map<string, { overPlan: boolean; assignedPoLabel: string | null }>();
  const { data: snapshots } = await supabase
    .from("proposal_route_snapshots")
    .select("proposal_revision_id,selected_wave_id,over_plan")
    .in("proposal_revision_id", revisionIds);
  const waveIds = [...new Set(((snapshots ?? []) as Array<{ selected_wave_id: string | null }>).flatMap((item) => item.selected_wave_id ? [item.selected_wave_id] : []))];
  const { data: waves } = waveIds.length
    ? await supabase.from("purchase_waves").select("id,wave_number").in("id", waveIds)
    : { data: [] };
  const waveNumbers = new Map(((waves ?? []) as Array<{ id: string; wave_number: number }>).map((item) => [item.id, item.wave_number]));
  const details = new Map<string, { overPlan: boolean; assignedPoLabel: string | null }>();
  for (const proposalId of proposalIds) {
    const revisionId = revisionByProposal.get(proposalId);
    const routeSnapshots = ((snapshots ?? []) as Array<{ proposal_revision_id: string; selected_wave_id: string | null; over_plan: boolean }>).filter((item) => item.proposal_revision_id === revisionId);
    const selectedWaveId = routeSnapshots.find((item) => item.selected_wave_id)?.selected_wave_id ?? null;
    const waveNumber = selectedWaveId ? waveNumbers.get(selectedWaveId) : undefined;
    details.set(proposalId, {
      overPlan: routeSnapshots.some((item) => item.over_plan),
      assignedPoLabel: waveNumber ? `PO ${waveNumber}` : null,
    });
  }
  return details;
}

function proposalToWorkItem(
  item: ProposalRow,
  userId: string,
  details: Map<string, { overPlan: boolean; assignedPoLabel: string | null }>,
): ApprovalWorkItem {
  const currentLevel: ApprovalWorkLevel = item.status.endsWith("executive") ? "executive" : "manager";
  const kind = item.status.startsWith("cancellation_") ? "proposal_cancellation" : "purchase_proposal";
  const brand = relation(item.brands);
  const owner = relation(item.profiles);
  const detail = details.get(item.id);
  return {
    id: `${kind}:${item.id}`,
    kind,
    targetId: item.id,
    href: `/proposals/${item.id}`,
    title: approvalWorkKindLabels[kind],
    submittedBy: text(owner.display_name) || "Người đề xuất",
    submittedAt: item.updated_at,
    brandCode: text(brand.code),
    brandName: text(brand.name),
    planningYear: Number(item.planning_year),
    currentLevel,
    assigneeId: currentLevel === "manager" ? item.assigned_manager_id ?? userId : item.assigned_executive_id ?? userId,
    overPlan: detail?.overPlan ?? false,
    assignedPoLabel: detail?.assignedPoLabel ?? null,
  };
}
