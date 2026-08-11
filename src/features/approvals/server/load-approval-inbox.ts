import "server-only";

import type { CurrentAccess } from "@/features/auth/access-types";
import type { ApprovalRequestView } from "@/features/approvals/approval-types";
import type { PlanDiff } from "@/features/versions/domain/diff-plan";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RequestRow {
  id: string;
  plan_version_id: string;
  plan_amount: string;
  currency_code: string;
  required_levels: 1 | 2;
  routing_reason: ApprovalRequestView["routingReason"];
  exception_flags: Record<string, boolean>;
  status: ApprovalRequestView["status"];
  current_level: number;
  submitted_by: string | null;
  submitted_at: string;
}

interface VersionRow {
  id: string;
  planning_cycle_id: string;
  version_number: number;
}

interface ProjectionRow {
  plan_version_id: string;
  shortage_qty: number;
  stock_status: string;
}

export async function loadApprovalInbox(
  access: CurrentAccess,
): Promise<ApprovalRequestView[]> {
  const supabase = await createServerSupabaseClient();
  const { data: requestData, error } = await supabase
    .from("approval_requests")
    .select(
      "id, plan_version_id, plan_amount, currency_code, required_levels, routing_reason, exception_flags, status, current_level, submitted_by, submitted_at",
    )
    .order("submitted_at", { ascending: false });
  if (error || !requestData) return [];
  const requests = requestData as RequestRow[];
  const versionIds = requests.map((request) => request.plan_version_id);
  if (versionIds.length === 0) return [];

  const { data: versionData } = await supabase
    .from("plan_versions")
    .select("id, planning_cycle_id, version_number")
    .in("id", versionIds);
  const versions = (versionData ?? []) as VersionRow[];
  const cycleIds = versions.map((version) => version.planning_cycle_id);
  const submitterIds = requests.flatMap((request) =>
    request.submitted_by ? [request.submitted_by] : [],
  );

  const [cycleResult, profileResult, diffResult, projectionResult] =
    await Promise.all([
      cycleIds.length
        ? supabase
            .from("planning_cycles")
            .select("id, code")
            .in("id", cycleIds)
        : Promise.resolve({ data: [] }),
      submitterIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", submitterIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("version_diffs")
        .select("to_version_id, diff_data")
        .in("to_version_id", versionIds),
      supabase
        .from("plan_projection_view")
        .select("plan_version_id, shortage_qty, stock_status")
        .in("plan_version_id", versionIds),
    ]);

  const cycles = new Map(
    ((cycleResult.data ?? []) as { id: string; code: string }[]).map((cycle) => [
      cycle.id,
      cycle.code,
    ]),
  );
  const profiles = new Map(
    ((profileResult.data ?? []) as { id: string; display_name: string }[]).map(
      (profile) => [profile.id, profile.display_name],
    ),
  );
  const diffs = new Map(
    ((diffResult.data ?? []) as { to_version_id: string; diff_data: PlanDiff[] }[]).map(
      (diff) => [diff.to_version_id, diff.diff_data],
    ),
  );
  const projections = (projectionResult.data ?? []) as ProjectionRow[];
  const roleSet = new Set(access.roles);

  return requests.flatMap((request) => {
    const version = versions.find((item) => item.id === request.plan_version_id);
    if (!version) return [];
    const requestProjections = projections.filter(
      (projection) => projection.plan_version_id === request.plan_version_id,
    );
    const requestDiffs = diffs.get(request.plan_version_id) ?? [];
    const canDecide =
      (request.status === "pending_l1" && roleSet.has("approver_l1")) ||
      (request.status === "pending_l2" && roleSet.has("approver_l2")) ||
      ((request.status === "pending_l1" || request.status === "pending_l2") &&
        roleSet.has("administrator"));

    return [
      {
        id: request.id,
        cycleCode: cycles.get(version.planning_cycle_id) ?? "Kế hoạch",
        planVersionId: request.plan_version_id,
        versionNumber: version.version_number,
        status: request.status,
        currentLevel: request.current_level,
        requiredLevels: request.required_levels,
        planAmount: request.plan_amount,
        currencyCode: request.currency_code,
        routingReason: request.routing_reason,
        exceptionFlags: request.exception_flags,
        submittedAt: request.submitted_at,
        submittedBy:
          (request.submitted_by && profiles.get(request.submitted_by)) ||
          "Người lập kế hoạch",
        criticalCount: requestProjections.filter(
          (projection) => projection.stock_status === "critical",
        ).length,
        shortageImpact: -requestProjections.reduce(
          (total, projection) => total + Number(projection.shortage_qty),
          0,
        ),
        amountChange: requestDiffs
          .filter((diff) => diff.path.endsWith(".amount"))
          .reduce(
            (total, diff) =>
              total + (Number(diff.after ?? 0) - Number(diff.before ?? 0)),
            0,
          ),
        diffs: requestDiffs,
        canDecide,
      },
    ];
  });
}
