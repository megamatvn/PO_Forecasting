import { notFound } from "next/navigation";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { PlanningWorkspace } from "@/features/planning/components/planning-workspace";
import { loadPlanningWorkspace } from "@/features/planning/server/load-planning-workspace";

interface PlanningPageProps {
  params: Promise<{ cycleId: string }>;
}

export default async function PlanningPage({ params }: PlanningPageProps) {
  const [{ cycleId }, access] = await Promise.all([params, getCurrentAccess()]);
  if (!access) notFound();

  const plan = await loadPlanningWorkspace(cycleId, access);
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
