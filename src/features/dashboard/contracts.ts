import type { OrgTier } from "@/features/organization/contracts";

export const dashboardActionKinds = [
  "approval",
  "late_wave",
  "over_plan",
  "private_draft",
] as const;
export type DashboardActionKind = (typeof dashboardActionKinds)[number];

export const dashboardMetricKeys = [
  "baseline",
  "allocated",
  "approved_proposals",
  "over_plan",
] as const;
export type DashboardMetricKey = (typeof dashboardMetricKeys)[number];

export interface DashboardContextDTO {
  brandId: string | null;
  brandCode: string | null;
  planningYear: number | null;
  tier: OrgTier;
}

export interface DashboardActionDTO {
  id: string;
  kind: DashboardActionKind;
  title: string;
  detail: string;
  href: string;
  dueLabel: string | null;
}

export interface DashboardMetricDTO {
  key: DashboardMetricKey;
  label: string;
  amount: string;
  context: string;
  progress: number | null;
}

export interface DashboardWaveDTO {
  id: string;
  name: string;
  arrivalMonth: string;
  usedUnits: number;
  plannedUnits: number;
  progress: number;
  status: string;
  officialPoNumber: string | null;
}

export interface DashboardExceptionDTO {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
}

export interface RoleDashboardDTO {
  context: DashboardContextDTO;
  displayName: string;
  actions: DashboardActionDTO[];
  metrics: DashboardMetricDTO[];
  waves: DashboardWaveDTO[];
  exceptions: DashboardExceptionDTO[];
  canViewBaseline: boolean;
}
