import type { ReactNode } from "react";

interface PlanContextBarProps {
  brand: ReactNode;
  year: ReactNode;
  version: ReactNode;
  status?: ReactNode;
}

export function PlanContextBar({
  brand,
  year,
  version,
  status,
}: PlanContextBarProps) {
  const context = [
    { label: "Nhãn hàng", value: brand },
    { label: "Kỳ kế hoạch", value: year },
    { label: "Phiên bản", value: version },
    ...(status ? [{ label: "Trạng thái", value: status }] : []),
  ];

  return (
    <section aria-label="Bối cảnh kế hoạch" className="plan-context-bar">
      <dl>
        {context.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
