import Link from "next/link";

export const planningWorkflowSteps = [
  { value: "products", label: "Sản phẩm" },
  { value: "po", label: "Đợt mua & ngày hàng về" },
  { value: "budget", label: "Ngân sách" },
  { value: "submit", label: "Gửi duyệt" },
] as const;

export type PlanningWorkflowStep = (typeof planningWorkflowSteps)[number]["value"];

export function resolvePlanningWorkflowStep(
  value: string | undefined,
): PlanningWorkflowStep {
  return planningWorkflowSteps.some((step) => step.value === value)
    ? (value as PlanningWorkflowStep)
    : "products";
}

interface PlanningWorkflowNavProps {
  step?: string;
  basePath: string;
  brandId?: string | null;
  versionId?: string | null;
}

function buildWorkflowHref(
  basePath: string,
  step: PlanningWorkflowStep,
  brandId?: string | null,
  versionId?: string | null,
) {
  const searchParams = new URLSearchParams({ step });
  if (brandId) searchParams.set("brandId", brandId);
  if (versionId) searchParams.set("versionId", versionId);
  return `${basePath}?${searchParams.toString()}`;
}

export function PlanningWorkflowNav({
  step,
  basePath,
  brandId,
  versionId,
}: PlanningWorkflowNavProps) {
  const activeStep = resolvePlanningWorkflowStep(step);

  return (
    <nav className="planning-workflow-nav" aria-label="Các bước lập kế hoạch">
      <ol>
        {planningWorkflowSteps.map((item, index) => (
          <li key={item.value}>
            <Link
              href={buildWorkflowHref(basePath, item.value, brandId, versionId)}
              aria-current={item.value === activeStep ? "step" : undefined}
            >
              <span aria-hidden="true">{index + 1}</span>
              {item.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
