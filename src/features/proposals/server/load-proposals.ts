import "server-only";

import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface ProposalListItemDTO {
  id: string;
  status: string;
  brandCode: string;
  brandName: string;
  planningYear: number;
  neededMonth: string;
  ownerName: string;
  assignedManagerName: string | null;
  assignedExecutiveName: string | null;
  updatedAt: string;
  routeKind: "manager_only" | "manager_then_executive" | null;
  routeReason: string | null;
}

export interface ProposalLineDTO {
  productId: string;
  sku: string;
  name: string;
  requestedQty: number;
}

export interface ProposalWaveDTO {
  id: string;
  sequence: number;
  neededMonth: string;
  capacityByProduct: Array<{ productId: string; plannedQty: number; remainingQty: number }>;
}

export interface ProposalViewerDTO extends ProposalListItemDTO {
  revisionId: string;
  lockVersion: number;
  brandId: string;
  reason: string;
  ownerId: string;
  managerName: string | null;
  executiveName: string | null;
  lines: ProposalLineDTO[];
  waves: ProposalWaveDTO[];
  canDecide: boolean;
  canDecideCancellation: boolean;
  canAssignWave: boolean;
  canWithdraw: boolean;
  viewerMode: "owner" | "manager" | "executive" | "administrator";
}

export interface ProposalCreationOptionsDTO {
  brands: Array<{ id: string; code: string; name: string }>;
  products: Array<{ id: string; canonicalSku: string; name: string }>;
  productsByBrand: Record<string, Array<{ id: string; canonicalSku: string; name: string }>>;
}

type RecordLike = Record<string, unknown>;
function row(value: unknown): RecordLike { return value && typeof value === "object" ? value as RecordLike : {}; }
function relation(value: unknown): RecordLike { return Array.isArray(value) ? row(value[0]) : row(value); }
function text(value: unknown): string { return value == null ? "" : String(value); }

function statusLabel(value: unknown): string { return text(value); }

export async function loadProposalList(): Promise<ProposalListItemDTO[]> {
  const access = await getOrganizationContext();
  if (!access) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_proposals")
    .select("id,status,planning_year,needed_month,updated_at,route_kind,route_reason,brands(code,name),profiles!purchase_proposals_owner_id_fkey(display_name),manager:profiles!purchase_proposals_assigned_manager_id_fkey(display_name),executive:profiles!purchase_proposals_assigned_executive_id_fkey(display_name)")
    .order("updated_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).map((value) => {
    const item = row(value); const brand = relation(item.brands); const owner = relation(item.profiles); const manager = relation(item.manager); const executive = relation(item.executive);
    return { id: text(item.id), status: statusLabel(item.status), brandCode: text(brand.code), brandName: text(brand.name), planningYear: Number(item.planning_year), neededMonth: text(item.needed_month).slice(0, 7), ownerName: text(owner.display_name) || "Người dùng", assignedManagerName: text(manager.display_name) || null, assignedExecutiveName: text(executive.display_name) || null, updatedAt: text(item.updated_at), routeKind: item.route_kind === "manager_only" || item.route_kind === "manager_then_executive" ? item.route_kind : null, routeReason: item.route_reason == null ? null : text(item.route_reason) };
  });
}

export async function loadProposalCreationOptions(requestedBrandId?: string): Promise<ProposalCreationOptionsDTO> {
  const access = await getOrganizationContext();
  if (!access) return { brands: [], products: [], productsByBrand: {} };
  const supabase = await createServerSupabaseClient();
  const { data: brandValues } = await supabase.rpc("list_proposal_brand_options_v2");
  const brands = (brandValues as unknown[] ?? []).map((value) => { const item = row(value); return { id: text(item.id), code: text(item.code), name: text(item.name) }; });
  const brandId = requestedBrandId && brands.some((brand) => brand.id === requestedBrandId) ? requestedBrandId : brands[0]?.id;
  if (!brandId) return { brands, products: [], productsByBrand: {} };
  const productEntries = await Promise.all(brands.map(async (brand) => {
    const { data: productValues } = await supabase.rpc("list_proposal_product_options_v2", { p_brand_id: brand.id });
    const products = (productValues as unknown[] ?? []).map((value) => { const item = row(value); return { id: text(item.id), canonicalSku: text(item.canonical_sku), name: text(item.name) }; });
    return [brand.id, products] as const;
  }));
  const productsByBrand = Object.fromEntries(productEntries);
  return { brands, products: productsByBrand[brandId] ?? [], productsByBrand };
}

export async function loadProposalForViewer(proposalId: string): Promise<ProposalViewerDTO | null> {
  const access = await getOrganizationContext();
  if (!access) return null;
  const supabase = await createServerSupabaseClient();
  const { data: proposalValue, error } = await supabase
    .from("purchase_proposals")
    .select("id,brand_id,planning_year,needed_month,owner_id,status,reason,baseline_revision_id,assigned_manager_id,assigned_executive_id,route_kind,route_reason,lock_version,updated_at,brands(code,name),profiles!purchase_proposals_owner_id_fkey(display_name),manager:profiles!purchase_proposals_assigned_manager_id_fkey(display_name),executive:profiles!purchase_proposals_assigned_executive_id_fkey(display_name)")
    .eq("id", proposalId)
    .maybeSingle();
  if (error || !proposalValue) return null;
  const item = row(proposalValue); const brand = relation(item.brands); const owner = relation(item.profiles); const manager = relation(item.manager); const executive = relation(item.executive);
  const { data: revisionValue } = await supabase.from("proposal_revisions").select("id,revision_number").eq("proposal_id", proposalId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
  if (!revisionValue) return null;
  const revision = row(revisionValue);
  const { data: linesValue } = await supabase.from("proposal_lines").select("product_id,requested_qty,products(canonical_sku,name)").eq("proposal_revision_id", text(revision.id));
  const lines = (linesValue as unknown[] ?? []).map((value) => { const line = row(value); const product = relation(line.products); return { productId: text(line.product_id), sku: text(product.canonical_sku), name: text(product.name), requestedQty: Number(line.requested_qty) }; });
  const { data: waveValues } = await supabase.from("purchase_wave_revisions").select("id,wave_id,needed_month,purchase_waves(wave_number,status),purchase_wave_allocations(product_id,paid_qty,foc_qty)").eq("revision_id", text(item.baseline_revision_id ?? ""));
  const waves = (waveValues as unknown[] ?? []).filter((value) => relation(row(value).purchase_waves).status !== "cancelled").map((value) => { const wave = row(value); const purchaseWave = relation(wave.purchase_waves); const allocations = Array.isArray(wave.purchase_wave_allocations) ? wave.purchase_wave_allocations : []; return { id: text(wave.wave_id), sequence: Number(purchaseWave.wave_number), neededMonth: text(wave.needed_month).slice(0, 7), capacityByProduct: allocations.map((allocation) => { const a = row(allocation); return { productId: text(a.product_id), plannedQty: Number(a.paid_qty ?? 0) + Number(a.foc_qty ?? 0), remainingQty: Number(a.paid_qty ?? 0) + Number(a.foc_qty ?? 0) }; }) }; });
  const isOwner = text(item.owner_id) === access.userId;
  const isManager = text(item.assigned_manager_id) === access.userId;
  const isExecutive = text(item.assigned_executive_id) === access.userId;
  const isAdministrator = access.isAdministrator;
  const canDecide = (item.status === "pending_manager" && isManager) || (item.status === "pending_executive" && isExecutive);
  const canDecideCancellation =
    (item.status === "cancellation_pending_manager" && isManager)
    || (item.status === "cancellation_pending_executive" && isExecutive);
  // Only the directly assigned Manager selects the PO. A Leader who owns the
  // request never receives plan/capacity controls; executive self-approval is
  // represented by the executive acting as their own assigned Manager.
  const canAssignWave = item.status === "pending_manager" && isManager;
  return { id: text(item.id), revisionId: text(revision.id), status: statusLabel(item.status), brandCode: text(brand.code), brandName: text(brand.name), brandId: text(item.brand_id), planningYear: Number(item.planning_year), neededMonth: text(item.needed_month).slice(0, 7), ownerName: text(owner.display_name) || "Người dùng", ownerId: text(item.owner_id), assignedManagerName: text(manager.display_name) || null, assignedExecutiveName: text(executive.display_name) || null, managerName: text(manager.display_name) || null, executiveName: text(executive.display_name) || null, updatedAt: text(item.updated_at), routeKind: item.route_kind === "manager_only" || item.route_kind === "manager_then_executive" ? item.route_kind : null, routeReason: item.route_reason == null ? null : text(item.route_reason), reason: text(item.reason), lockVersion: Number(item.lock_version ?? 0), lines, waves, canDecide, canDecideCancellation, canAssignWave, canWithdraw: isOwner && ["pending_manager", "pending_executive"].includes(text(item.status)), viewerMode: isAdministrator ? "administrator" : isExecutive ? "executive" : isManager ? "manager" : "owner" };
}
