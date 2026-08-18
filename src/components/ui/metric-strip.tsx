import type { ReactNode } from "react";

export interface MetricItem {
  label: string;
  value: ReactNode;
  supportingText?: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "critical";
}

interface MetricStripProps {
  title?: ReactNode;
  ariaLabel?: string;
  items: readonly MetricItem[];
}

export function MetricStrip({
  title,
  ariaLabel = "Chỉ số kế hoạch",
  items,
}: MetricStripProps) {
  return (
    <section aria-label={ariaLabel} className="metric-strip">
      {title ? <h2>{title}</h2> : null}
      <dl>
        {items.map(({ label, value, supportingText, tone = "neutral" }) => (
          <div key={label} data-tone={tone}>
            <dt>{label}</dt>
            <dd>
              <span className="metric-strip__value">{value}</span>
              {supportingText ? (
                <span className="metric-strip__supporting-text">{supportingText}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
