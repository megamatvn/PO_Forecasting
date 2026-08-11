import { notFound } from "next/navigation";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { PlanningWorkspace } from "@/features/planning/components/planning-workspace";
import { loadPlanningWorkspace } from "@/features/planning/server/load-planning-workspace";

interface PlanningPageProps {
  params: Promise<{ cycleId: string }>;
  searchParams: Promise<{ versionId?: string | string[] }>;
}

export default async function PlanningPage({ params, searchParams }: PlanningPageProps) {
  const [{ cycleId }, query, access] = await Promise.all([
    params,
    searchParams,
    getCurrentAccess(),
  ]);
  if (!access) notFound();

  const versionId = Array.isArray(query.versionId) ? query.versionId[0] : query.versionId;
  const plan = await loadPlanningWorkspace(cycleId, access, versionId);
  if (!plan) notFound();

  return (
    <div className="page-shell planning-page">
      <PlanningWorkspace
        initialPlan={plan}
        presenceDisplayName={access.displayName}
      />
    </div>
  );
}
