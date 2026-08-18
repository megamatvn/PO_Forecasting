import { notFound } from "next/navigation";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { PlanningWorkspace } from "@/features/planning/components/planning-workspace";
import { loadPlanningWorkspace } from "@/features/planning/server/load-planning-workspace";
import { loadDashboard } from "@/features/reports/server/load-dashboard";

interface PlanningPageProps {
  params: Promise<{ cycleId: string }>;
  searchParams: Promise<{
    brandId?: string | string[];
    versionId?: string | string[];
    step?: string | string[];
    lineId?: string | string[];
  }>;
}

export default async function PlanningPage({ params, searchParams }: PlanningPageProps) {
  const [{ cycleId }, query] = await Promise.all([params, searchParams]);
  const requestedBrandId = Array.isArray(query.brandId)
    ? query.brandId[0]
    : query.brandId;
  const access = await getCurrentAccess(requestedBrandId);
  if (!access) notFound();

  const versionId = Array.isArray(query.versionId) ? query.versionId[0] : query.versionId;
  const workflowStep = Array.isArray(query.step) ? query.step[0] : query.step;
  const requestedLineId = Array.isArray(query.lineId) ? query.lineId[0] : query.lineId;
  const plan = await loadPlanningWorkspace(
    cycleId,
    access,
    versionId,
    access.activeBrandId ?? undefined,
  );
  if (!plan) notFound();
  const initialSelectedPlanLineId = requestedLineId
    && plan.rows.some((row) => row.planLineId === requestedLineId)
    ? requestedLineId
    : null;
  const poDashboard = workflowStep === "po"
    ? await loadDashboard(cycleId, access, {
        versionId: plan.version.id,
        brandId: access.activeBrandId ?? undefined,
      })
    : null;

  return (
    <div className="page-shell planning-page">
      <PlanningWorkspace
        key={plan.version.id}
        initialPlan={plan}
        presenceDisplayName={access.displayName}
        workflowStep={workflowStep}
        workflowBasePath={`/planning/${cycleId}`}
        workflowBrandId={access.activeBrandId}
        poBatches={poDashboard?.batches}
        initialSelectedPlanLineId={initialSelectedPlanLineId}
      />
    </div>
  );
}
