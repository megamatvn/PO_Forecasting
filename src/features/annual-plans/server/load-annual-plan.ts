import "server-only";

import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { mapBrandDto, type BrandOptionDTO } from "@/features/master-data/contracts";
import type { ProductOptionDTO } from "@/features/master-data/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { annualPlanStatuses, MAX_ANNUAL_PLAN_YEAR, type AnnualPlanStatus } from "../contracts";
import { calculateAnnualLine } from "../domain/calculations";

export const annualPlanSteps = ["scope", "lines", "waves", "review"] as const;
export type AnnualPlanStep = (typeof annualPlanSteps)[number];

export interface AnnualPlanWizardDTO {
  revision: { id: string; cycleId: string; ownerId: string; status: AnnualPlanStatus; lockVersion: number };
  scope: { brand: BrandOptionDTO | null; planningYear: number | null };
  brands: BrandOptionDTO[];
  planningYears: number[];
  allowedSteps: AnnualPlanStep[];
  saveState: "saved" | "saving" | "error";
  products: ProductOptionDTO[];
  initialLines: Array<{ clientRowId: string; productId: string; exPrice: string; paidQty: number; expectedFoc: number; openingStock: number }>;
  initialWaves: Array<{ id: string; sequence: number; name: string; orderMonth: string; arrivalMonth: string; status: "planned" | "ordered" | "supplier_confirmed" | "received" | "cancelled"; canDelete: boolean; allocations: Array<{ productId: string; paidQty: number; focQty: number; exPrice: string }> }>;
}

export interface AnnualPlanReviewDTO {
  revisionId: string;
  ownerName: string;
  brand: { code: string; name: string };
  planningYear: number;
  status: Extract<AnnualPlanStatus, "draft_owner_only" | "pending_executive" | "approved" | "changes_requested" | "rejected">;
  role: "manager" | "executive";
  assignedExecutiveName: string | null;
  totals: { budget: string; paidQty: string; focQty: string; skuCount: number; waveCount: number };
  waves: Array<{ id: string; sequence: number; orderMonth: string; arrivalMonth: string; total: string }>;
  errors: string[];
  warnings: string[];
}

function currentYear(): number { return new Date().getFullYear(); }

function planningYearsFrom(year: number): number[] {
  return Array.from({ length: Math.max(0, MAX_ANNUAL_PLAN_YEAR - year + 1) }, (_, index) => year + index);
}

function normalizeBrand(value: unknown): BrandOptionDTO | null {
  if (!value || typeof value !== "object") return null;
  return mapBrandDto(value as Record<string, unknown>);
}

function allowedStepsFor(status: AnnualPlanStatus, ownerId: string, userId: string): AnnualPlanStep[] {
  if (ownerId !== userId || status !== "draft_owner_only") return ["review"];
  return [...annualPlanSteps];
}

function mapProducts(values: unknown): ProductOptionDTO[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => {
    const row = value as Record<string, unknown>;
    return {
      id: String(row.id ?? row.product_id ?? ""),
      brandId: String(row.brandId ?? row.brand_id ?? ""),
      canonicalSku: String(row.canonicalSku ?? row.canonical_sku ?? ""),
      name: String(row.name ?? ""),
      isActive: Boolean(row.isActive ?? row.is_active ?? true),
      aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
      warning: row.warning == null ? null : String(row.warning),
    };
  }).filter((product) => product.id && product.brandId);
}

export async function loadAnnualPlan(revisionId?: string, requestedBrandId?: string, requestedYear?: number): Promise<AnnualPlanWizardDTO | null> {
  const access = await getOrganizationContext();
  if (!access) return null;
  const supabase = await createServerSupabaseClient();
  const brandsFromAccess = access.brands.map((brand) => ({ id: brand.id, code: brand.code, name: brand.name, isActive: true }));
  const [{ data: brandRows }, { data: userResult }] = await Promise.all([
    supabase.rpc("list_brand_options_v2", { p_include_inactive: false }),
    supabase.auth.getUser(),
  ]);
  const allowedBrandIds = new Set(access.brands.map((brand) => brand.id));
  const brands = (Array.isArray(brandRows) ? brandRows.map(normalizeBrand).filter((brand): brand is BrandOptionDTO => Boolean(brand)) : brandsFromAccess)
    .filter((brand) => allowedBrandIds.has(brand.id) || access.isAdministrator);
  const year = currentYear();
  const planningYears = planningYearsFrom(year);

  if (!revisionId) {
    const brand = brands.find((item) => item.id === requestedBrandId) ?? null;
    const { data: productRows } = brand ? await supabase.rpc("list_product_options_v2", { p_brand_id: brand.id, p_include_inactive: false }) : { data: [] };
    return {
      revision: { id: "", cycleId: "", ownerId: userResult.user?.id ?? access.userId, status: "draft_owner_only", lockVersion: 0 },
      scope: { brand, planningYear: requestedYear && requestedYear >= year && requestedYear <= MAX_ANNUAL_PLAN_YEAR ? requestedYear : year },
      brands,
      planningYears,
      allowedSteps: ["scope"],
      saveState: "saved",
      products: mapProducts(productRows),
      initialLines: [],
      initialWaves: [],
    };
  }

  const { data: revisionRow, error } = await supabase
    .from("annual_plan_revisions")
    .select("id, cycle_id, owner_id, status, lock_version, annual_plan_cycles(brand_id, planning_year)")
    .eq("id", revisionId)
    .maybeSingle();
  if (error || !revisionRow) return null;
  const cycle = Array.isArray(revisionRow.annual_plan_cycles) ? revisionRow.annual_plan_cycles[0] : revisionRow.annual_plan_cycles;
  const brandId = String((cycle as { brand_id?: string } | null)?.brand_id ?? "");
  const brand = brands.find((item) => item.id === brandId) ?? null;
  const status = String(revisionRow.status) as AnnualPlanStatus;
  if (!annualPlanStatuses.includes(status)) return null;
  const ownerId = String(revisionRow.owner_id);
  const userId = userResult.user?.id ?? access.userId;
  // A draft is an owner's workspace. Administrators may see only the generic
  // conflict metadata in the catalog, never the draft's lines or scope page.
  if (status === "draft_owner_only" && ownerId !== userId) return null;
  const [{ data: productRows }, { data: lineRows }, { data: waveRows }] = await Promise.all([
    supabase.rpc("list_product_options_v2", { p_brand_id: brandId, p_include_inactive: false }),
    supabase.from("annual_plan_lines").select("id,product_id,opening_stock,annual_paid_qty,annual_foc_qty,ex_price").eq("revision_id", revisionId).order("created_at", { ascending: true }),
    supabase.from("purchase_wave_revisions").select("id,wave_id,order_month,arrival_month,needed_month,purchase_waves(wave_number,status),purchase_wave_allocations(product_id,paid_qty,foc_qty,ex_price)").eq("revision_id", revisionId).order("order_month", { ascending: true }),
  ]);
  const products = mapProducts(productRows);
  const initialLines = (Array.isArray(lineRows) ? lineRows : []).map((value) => {
    const row = value as Record<string, unknown>;
    return { clientRowId: String(row.id), productId: String(row.product_id), exPrice: String(row.ex_price ?? "0"), paidQty: Number(row.annual_paid_qty ?? 0), expectedFoc: Number(row.annual_foc_qty ?? 0), openingStock: Number(row.opening_stock ?? 0) };
  });
  const initialWaves = (Array.isArray(waveRows) ? waveRows : []).map((value) => {
    const row = value as Record<string, unknown>;
    const purchaseWave = Array.isArray(row.purchase_waves) ? row.purchase_waves[0] as Record<string, unknown> | undefined : row.purchase_waves as Record<string, unknown> | undefined;
    const orderMonth = String(row.order_month ?? row.needed_month ?? "").slice(0, 7);
    const arrivalMonth = String(row.arrival_month ?? row.needed_month ?? "").slice(0, 7);
    const sequence = Number(purchaseWave?.wave_number ?? 0);
    const allocations = Array.isArray(row.purchase_wave_allocations) ? row.purchase_wave_allocations.map((allocation) => {
      const item = allocation as Record<string, unknown>;
      return { productId: String(item.product_id), paidQty: Number(item.paid_qty ?? 0), focQty: Number(item.foc_qty ?? 0), exPrice: String(item.ex_price ?? "0") };
    }) : [];
    return { id: String(row.wave_id), sequence, name: `PO #${sequence}`, orderMonth, arrivalMonth, status: String(purchaseWave?.status ?? "planned") as "planned" | "ordered" | "supplier_confirmed" | "received" | "cancelled", canDelete: String(purchaseWave?.status ?? "planned") === "planned", allocations };
  });
  return {
    revision: { id: String(revisionRow.id), cycleId: String(revisionRow.cycle_id), ownerId, status, lockVersion: Number(revisionRow.lock_version ?? 0) },
    scope: { brand, planningYear: Number((cycle as { planning_year?: number } | null)?.planning_year ?? year) },
    brands,
    planningYears,
    allowedSteps: allowedStepsFor(status, ownerId, userId),
    saveState: "saved",
    products,
    initialLines,
    initialWaves,
  };
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value)} €`;
}

/** Load only the minimum data needed for the immutable confirmation screen. */
export async function loadAnnualPlanReview(revisionId: string): Promise<AnnualPlanReviewDTO | null> {
  const access = await getOrganizationContext();
  if (!access) return null;
  const supabase = await createServerSupabaseClient();
  const [{ data: revision }] = await Promise.all([
    supabase.from("annual_plan_revisions").select("id, cycle_id, owner_id, status, assigned_executive_id").eq("id", revisionId).maybeSingle(),
  ]);
  if (!revision) return null;
  const revisionRow = revision as { id: string; cycle_id: string; owner_id: string; status: AnnualPlanReviewDTO["status"]; assigned_executive_id: string | null };
  if (!annualPlanStatuses.includes(revisionRow.status)) return null;
  const [{ data: cycle }, { data: lines }, { data: waves }, { data: ownerProfile }, { data: executiveProfile }] = await Promise.all([
    supabase.from("annual_plan_cycles").select("brand_id, planning_year, brands(code, name)").eq("id", revisionRow.cycle_id).maybeSingle(),
    supabase.from("annual_plan_lines").select("product_id, annual_paid_qty, annual_foc_qty, ex_price, products(canonical_sku, name)").eq("revision_id", revisionId),
    supabase.from("purchase_wave_revisions").select("id, wave_id, order_month, arrival_month, needed_month, purchase_waves(wave_number, status), purchase_wave_allocations(product_id, paid_qty, foc_qty, ex_price)").eq("revision_id", revisionId),
    supabase.from("profiles").select("display_name").eq("id", revisionRow.owner_id).maybeSingle(),
    revisionRow.assigned_executive_id ? supabase.from("profiles").select("display_name").eq("id", revisionRow.assigned_executive_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!cycle) return null;
  const cycleRow = cycle as { brand_id: string; planning_year: number; brands?: { code?: string; name?: string } | Array<{ code?: string; name?: string }> | null };
  const brandRow = Array.isArray(cycleRow.brands) ? cycleRow.brands[0] : cycleRow.brands;
  const lineRows = (lines ?? []) as Array<{ product_id: string; annual_paid_qty: number; annual_foc_qty: number; ex_price: string; products?: { canonical_sku?: string; name?: string } | Array<{ canonical_sku?: string; name?: string }> | null }>;
  const waveRows = (waves ?? []) as Array<{ id: string; wave_id: string; order_month?: string; arrival_month?: string; needed_month?: string; purchase_waves?: { wave_number?: number; status?: string } | Array<{ wave_number?: number; status?: string }>; purchase_wave_allocations?: Array<{ product_id: string; paid_qty: number; foc_qty: number; ex_price: string }> }>;
  const budget = lineRows.reduce((sum, line) => sum + Number(calculateAnnualLine({ exPrice: String(line.ex_price), paidQty: Number(line.annual_paid_qty), expectedFoc: Number(line.annual_foc_qty), openingStock: 0 }).plannedAmount), 0);
  const paidQty = lineRows.reduce((sum, line) => sum + Number(line.annual_paid_qty), 0);
  const focQty = lineRows.reduce((sum, line) => sum + Number(line.annual_foc_qty), 0);
  const errors: string[] = [];
  if (!lineRows.length) errors.push("Chưa có SKU trong kế hoạch.");
  if (!waveRows.length) errors.push("Chưa có đợt mua trong kế hoạch.");
  for (const line of lineRows) {
    const allocated = waveRows.flatMap((wave) => wave.purchase_wave_allocations ?? []).filter((allocation) => allocation.product_id === line.product_id);
    const allocatedPaid = allocated.reduce((sum, allocation) => sum + Number(allocation.paid_qty), 0);
    const allocatedFoc = allocated.reduce((sum, allocation) => sum + Number(allocation.foc_qty), 0);
    if (allocatedPaid !== Number(line.annual_paid_qty) || allocatedFoc !== Number(line.annual_foc_qty)) errors.push(`SKU ${line.product_id} chưa khớp tổng Qty/FOC theo năm.`);
  }
  return {
    revisionId,
    ownerName: String((ownerProfile as { display_name?: string } | null)?.display_name ?? "Người lập kế hoạch"),
    brand: { code: String(brandRow?.code ?? ""), name: String(brandRow?.name ?? "") },
    planningYear: Number(cycleRow.planning_year),
    status: revisionRow.status,
    role: access.tier === "executive" ? "executive" : "manager",
    assignedExecutiveName: String((executiveProfile as { display_name?: string } | null)?.display_name ?? "") || null,
    totals: { budget: formatMoney(budget), paidQty: formatInteger(paidQty), focQty: formatInteger(focQty), skuCount: lineRows.length, waveCount: waveRows.length },
    waves: waveRows.map((wave) => {
      const purchaseWave = Array.isArray(wave.purchase_waves) ? wave.purchase_waves[0] : wave.purchase_waves;
      const total = (wave.purchase_wave_allocations ?? []).reduce((sum, allocation) => sum + Number(calculateAnnualLine({ exPrice: String(allocation.ex_price), paidQty: Number(allocation.paid_qty), expectedFoc: 0, openingStock: 0 }).plannedAmount), 0);
      const orderMonth = String(wave.order_month ?? wave.needed_month ?? "").slice(0, 7);
      const arrivalMonth = String(wave.arrival_month ?? wave.needed_month ?? "").slice(0, 7);
      return { id: wave.wave_id, sequence: Number(purchaseWave?.wave_number ?? 0), orderMonth, arrivalMonth, total: formatMoney(total) };
    }),
    errors,
    warnings: [],
  };
}
