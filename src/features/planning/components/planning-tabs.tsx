import Link from "next/link";

interface PlanningTabsProps {
  cycleId: string;
  versionId: string;
}

export function PlanningTabs({ cycleId, versionId }: PlanningTabsProps) {
  const dashboardHref = `/dashboard?cycleId=${encodeURIComponent(cycleId)}`;

  return (
    <nav className="planning-tabs" aria-label="Các chế độ xem kế hoạch">
      <Link href="#planning-grid-title" role="tab" aria-selected="true">
        Planning Grid
      </Link>
      <Link href={`${dashboardHref}#po-timeline`} role="tab" aria-selected="false">
        PO Timeline
      </Link>
      <Link href={`${dashboardHref}#cash-summary`} role="tab" aria-selected="false">
        Cash Summary
      </Link>
      <Link href={`/versions/${versionId}`} role="tab" aria-selected="false">
        Version History
      </Link>
    </nav>
  );
}
