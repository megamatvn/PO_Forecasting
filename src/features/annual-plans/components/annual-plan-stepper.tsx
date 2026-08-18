import Link from "next/link";
import type { AnnualPlanStep } from "../server/load-annual-plan";

const labels: Record<AnnualPlanStep, string> = {
  scope: "Phạm vi",
  lines: "SKU",
  waves: "Đợt mua",
  review: "Xem lại",
};

export function AnnualPlanStepper({ revisionId, currentStep, allowedSteps }: { revisionId?: string; currentStep: AnnualPlanStep; allowedSteps: readonly AnnualPlanStep[] }) {
  return (
    <nav className="annual-plan-stepper" aria-label="Các bước kế hoạch">
      <p className="annual-plan-stepper__mobile-label">Bước {Math.max(1, allowedSteps.indexOf(currentStep) + 1)}/{allowedSteps.length || 1}</p>
      <ol>
        {allowedSteps.map((step, index) => {
          const href = revisionId
            ? `/annual-plans/${revisionId}?step=${step}`
            : `/annual-plans/new?step=${step}`;
          return (
            <li key={step} data-current={step === currentStep || undefined}>
              <Link href={href} aria-current={step === currentStep ? "step" : undefined}>
                <span className="annual-plan-stepper__number">{index + 1}</span>
                <span>{labels[step]}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="annual-plan-stepper__progress" aria-hidden="true"><span style={{ width: `${((Math.max(0, allowedSteps.indexOf(currentStep)) + 1) / Math.max(1, allowedSteps.length)) * 100}%` }} /></div>
    </nav>
  );
}

export { labels as annualPlanStepLabels };
