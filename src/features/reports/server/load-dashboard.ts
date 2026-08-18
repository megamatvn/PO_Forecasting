import "server-only";

import type { CurrentAccess } from "@/features/auth/access-types";
import type { PurchaseBatchStatus } from "@/features/planning/contracts";
import { loadPlanningWorkspace } from "@/features/planning/server/load-planning-workspace";
import { buildDashboardInsights } from "@/features/reports/domain/dashboard-insights";
import type { DashboardView, PoTimelineItem } from "@/features/reports/report-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface LoadDashboardOptions {
  status?: PurchaseBatchStatus | "all";
  days?: number | null;
  versionId?: string;
  brandId?: string;
}

interface BatchRow {
  id: string;
  batch_number: number;
  name: string;
  order_date: string;
  eta_date: string;
  status: PurchaseBatchStatus;
}

interface PurchaseLineRow {
  purchase_batch_id: string;
  amount: string;
}

export async function loadDashboard(
  cycleIdOrCode: string,
  access: CurrentAccess,
  options: LoadDashboardOptions = {},
): Promise<DashboardView | null> {
  const plan = await loadPlanningWorkspace(
    cycleIdOrCode,
    access,
    options.versionId,
    options.brandId,
  );
  if (!plan) return null;

  const supabase = await createServerSupabaseClient();
  let batchQuery = supabase
    .from("purchase_batches")
    .select("id, batch_number, name, order_date, eta_date, status")
    .eq("plan_version_id", plan.version.id)
    .order("eta_date");

  if (options.status && options.status !== "all") {
    batchQuery = batchQuery.eq("status", options.status);
  } else {
    batchQuery = batchQuery.neq("status", "cancelled");
  }

  if (options.days) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - options.days);
    batchQuery = batchQuery.gte("eta_date", cutoff.toISOString().slice(0, 10));
  }

  const { data: batchData, error: batchError } = await batchQuery;
  if (batchError) return null;
  const batches = (batchData ?? []) as BatchRow[];
  const batchIds = batches.map((batch) => batch.id);
  const { data: lineData, error: lineError } = batchIds.length
    ? await supabase
        .from("purchase_lines")
        .select("purchase_batch_id, amount")
        .in("purchase_batch_id", batchIds)
    : { data: [], error: null };
  if (lineError) return null;
  const lines = (lineData ?? []) as PurchaseLineRow[];

  const timeline: PoTimelineItem[] = batches.map((batch) => {
    const batchLines = lines.filter((line) => line.purchase_batch_id === batch.id);
    return {
      id: batch.id,
      batchNumber: batch.batch_number,
      name: batch.name,
      orderDate: batch.order_date,
      etaDate: batch.eta_date,
      status: batch.status,
      amount: batchLines.reduce((total, line) => total + Number(line.amount), 0),
      lineCount: batchLines.length,
    };
  });
  const committedAmount = timeline.reduce((total, batch) => total + batch.amount, 0);
  const targetAmount = Number(plan.cycle.targetPurchaseAmount);
  const kpis = {
    targetAmount,
    committedAmount,
    gapAmount: targetAmount - committedAmount,
    criticalCount: plan.rows.filter((row) => row.severity === "critical").length,
    actionableSkuCount: plan.rows.filter((row) => row.recommendedQty > 0).length,
    poCount: timeline.length,
  };

  return {
    plan,
    batches: timeline,
    kpis,
    insights: buildDashboardInsights(plan.rows, timeline, kpis),
  };
}
