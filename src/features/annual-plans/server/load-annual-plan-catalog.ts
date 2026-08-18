import "server-only";

import type { BrandOptionDTO } from "@/features/master-data/contracts";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { annualPlanStatuses, MAX_ANNUAL_PLAN_YEAR, type AnnualPlanStatus } from "../contracts";

export interface AnnualPlanCatalogEntry {
  revisionId: string;
  cycleId: string;
  brandId: string;
  brandCode: string;
  brandName: string;
  planningYear: number;
  revisionNumber: number;
  status: AnnualPlanStatus;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
}

export interface AnnualPlanDraftConflict {
  /** Deliberately no revision id, owner id or line data: this is only a generic conflict hint. */
  brandId: string;
  brandCode: string;
  brandName: string;
  planningYear: number;
}

export interface AnnualPlanCatalogDTO {
  myDrafts: AnnualPlanCatalogEntry[];
  myPending: AnnualPlanCatalogEntry[];
  approvedBaselines: AnnualPlanCatalogEntry[];
  revisionHistory: AnnualPlanCatalogEntry[];
  draftConflicts: AnnualPlanDraftConflict[];
  brands: BrandOptionDTO[];
  currentYear: number;
  planningYears: number[];
  maxPlanningYear: number;
  canCreatePlan: boolean;
}

const catalogSelect = "id,cycle_id,owner_id,revision_number,status,updated_at,submitted_at,approved_at,annual_plan_cycles(id,brand_id,planning_year,brands(code,name))";

function planningYearsFrom(currentYear: number): number[] {
  return Array.from({ length: Math.max(0, MAX_ANNUAL_PLAN_YEAR - currentYear + 1) }, (_, index) => currentYear + index);
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function brandFromCycle(cycle: Record<string, unknown> | null): { id: string; code: string; name: string } | null {
  if (!cycle) return null;
  const brand = firstObject(cycle.brands);
  const id = String(cycle.brand_id ?? "");
  const code = String(brand?.code ?? "");
  const name = String(brand?.name ?? "");
  return id && code && name ? { id, code, name } : null;
}

function toEntry(value: unknown): AnnualPlanCatalogEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = String(row.status ?? "") as AnnualPlanStatus;
  if (!annualPlanStatuses.includes(status)) return null;
  const cycle = firstObject(row.annual_plan_cycles);
  const brand = brandFromCycle(cycle);
  if (!brand) return null;
  const revisionId = String(row.id ?? "");
  const cycleId = String(row.cycle_id ?? cycle?.id ?? "");
  const planningYear = Number(cycle?.planning_year ?? 0);
  if (!revisionId || !cycleId || !Number.isInteger(planningYear)) return null;
  return {
    revisionId,
    cycleId,
    brandId: brand.id,
    brandCode: brand.code,
    brandName: brand.name,
    planningYear,
    revisionNumber: Number(row.revision_number ?? 0),
    status,
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    submittedAt: row.submitted_at == null ? null : String(row.submitted_at),
    approvedAt: row.approved_at == null ? null : String(row.approved_at),
  };
}

function sortNewest(left: AnnualPlanCatalogEntry, right: AnnualPlanCatalogEntry): number {
  const updated = right.updatedAt.localeCompare(left.updatedAt);
  return updated || right.revisionNumber - left.revisionNumber;
}

export async function loadAnnualPlanCatalog(): Promise<AnnualPlanCatalogDTO | null> {
  const access = await getOrganizationContext();
  if (!access) return null;

  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("annual_plan_revisions")
    .select(catalogSelect)
    .order("updated_at", { ascending: false });
  if (result.error) return null;

  const currentYear = new Date().getFullYear();
  const allowedBrandIds = new Set(access.brands.map((brand) => brand.id));
  const canViewApproved = access.isAdministrator
    || access.capabilities.includes("view_approved_plan")
    || access.brands.some((brand) => brand.capabilities.includes("view_approved_plan"));
  const rows = (Array.isArray(result.data) ? result.data : []) as Array<Record<string, unknown>>;
  const ownedRevisionIds = new Set(rows.filter((row) => String(row.owner_id ?? "") === access.userId).map((row) => String(row.id ?? "")));
  const entries = rows.map(toEntry).filter((entry): entry is AnnualPlanCatalogEntry => Boolean(entry));
  const own = entries.filter((entry) => ownedRevisionIds.has(entry.revisionId));
  const myDrafts = own.filter((entry) => entry.status === "draft_owner_only").sort(sortNewest);
  const myPending = own.filter((entry) => entry.status === "pending_executive").sort(sortNewest);

  const approvedCandidates = canViewApproved
    ? entries.filter((entry) => entry.status === "approved" && (access.isAdministrator || allowedBrandIds.has(entry.brandId))).sort((left, right) => left.revisionNumber - right.revisionNumber || left.updatedAt.localeCompare(right.updatedAt))
    : [];
  const latestByCycle = new Map<string, AnnualPlanCatalogEntry>();
  for (const entry of approvedCandidates) {
    const existing = latestByCycle.get(entry.cycleId);
    if (!existing || entry.revisionNumber > existing.revisionNumber || (entry.revisionNumber === existing.revisionNumber && entry.updatedAt > existing.updatedAt)) latestByCycle.set(entry.cycleId, entry);
  }
  const approvedBaselines = [...latestByCycle.values()].sort(sortNewest);
  const baselineIds = new Set(approvedBaselines.map((entry) => entry.revisionId));
  const revisionHistory = entries
    .filter((entry) => {
      if (entry.status === "approved") return canViewApproved && (access.isAdministrator || allowedBrandIds.has(entry.brandId)) && !baselineIds.has(entry.revisionId);
      return ["changes_requested", "rejected", "withdrawn", "superseded"].includes(entry.status)
        && (ownedRevisionIds.has(entry.revisionId) || (access.isAdministrator && allowedBrandIds.has(entry.brandId)));
    })
    .sort(sortNewest);

  const draftConflicts = access.isAdministrator
    ? entries
      .filter((entry) => entry.status === "draft_owner_only" && !ownedRevisionIds.has(entry.revisionId))
      .map(({ brandId, brandCode, brandName, planningYear }) => ({ brandId, brandCode, brandName, planningYear }))
      .filter((entry, index, values) => values.findIndex((candidate) => candidate.brandId === entry.brandId && candidate.planningYear === entry.planningYear) === index)
    : [];

  return {
    myDrafts,
    myPending,
    approvedBaselines,
    revisionHistory,
    draftConflicts,
    brands: access.brands.map((brand) => ({ id: brand.id, code: brand.code, name: brand.name, isActive: true })),
    currentYear,
    planningYears: planningYearsFrom(currentYear),
    maxPlanningYear: MAX_ANNUAL_PLAN_YEAR,
    canCreatePlan: access.isAdministrator || access.capabilities.includes("create_annual_plan") || access.brands.some((brand) => brand.capabilities.includes("create_annual_plan")),
  };
}
