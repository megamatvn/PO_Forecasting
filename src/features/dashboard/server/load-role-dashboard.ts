import "server-only";

import type { CurrentAccessV2 } from "@/features/auth/access-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  DashboardActionDTO,
  DashboardExceptionDTO,
  DashboardMetricDTO,
  RoleDashboardDTO,
} from "../contracts";

type RevisionStatus = "approved" | "pending_executive" | "draft_owner_only" | string;

export interface DashboardProjectionLine {
  brandId: string;
  brandCode: string;
  brandName: string;
  planningYear: number;
  revisionId: string;
  revisionStatus: RevisionStatus;
  productId: string;
  sku: string;
  productName: string;
  annualPaidQty: number;
  annualFocQty: number;
  openingStock: number;
  exPrice: string;
  baselineAmount: string;
  allocatedPaidQty: number;
  allocatedFocQty: number;
  allocatedAmount: string;
}

export interface DashboardProjectionWave {
  id: string;
  brandId: string;
  brandCode: string;
  planningYear: number;
  revisionStatus: RevisionStatus;
  waveNumber: number;
  status: string;
  orderMonth: string;
  arrivalMonth: string;
  officialPoNumber: string | null;
  orderedAt: string | null;
  supplierConfirmedAt: string | null;
  receivedAt: string | null;
  plannedUnits: number;
  usedUnits: number;
  amount: string;
}

export interface DashboardProjectionProposal {
  id: string;
  brandId: string;
  planningYear: number;
  status: string;
  ownerId: string;
  assignedManagerId: string | null;
  assignedExecutiveId: string | null;
  neededMonth: string;
  requestedUnits: number;
  referenceAmount: string;
  overPlan: boolean;
  routeReason: string | null;
  updatedAt: string;
}

export interface DashboardProjectionGovernance {
  activeUsersWithoutSupervisor: number;
  brandsWithoutActivePolicy: number;
  pendingNotificationOutbox: number;
}

export interface DashboardProjectionInput {
  baselineLines: DashboardProjectionLine[];
  waves: DashboardProjectionWave[];
  proposals: DashboardProjectionProposal[];
  governance?: DashboardProjectionGovernance;
}

type ProjectionRow = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function numberValue(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function relation(value: unknown): ProjectionRow {
  return Array.isArray(value) ? (value[0] as ProjectionRow | undefined) ?? {} : (value as ProjectionRow | null) ?? {};
}

function money(value: number): string {
  return `${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} €`;
}

function percent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function canViewBaseline(context: CurrentAccessV2, brandId: string | null): boolean {
  if (context.isAdministrator || context.capabilities.includes("view_approved_plan")) return true;
  return Boolean(brandId && context.brands.some((brand) => brand.id === brandId && brand.capabilities.includes("view_approved_plan")));
}

function scopeMatches(row: { brandId: string; planningYear: number }, brandId: string | null, planningYear: number): boolean {
  return (!brandId || row.brandId === brandId) && row.planningYear === planningYear;
}

function metric(key: DashboardMetricDTO["key"], label: string, amount: number, context: string, progress: number | null): DashboardMetricDTO {
  return { key, label, amount: money(amount), context, progress };
}

function hiddenMetric(key: DashboardMetricDTO["key"], label: string): DashboardMetricDTO {
  return { key, label, amount: "—", context: "Chỉ hiển thị khi tài khoản có quyền xem kế hoạch đã duyệt.", progress: null };
}

function createActions(
  context: CurrentAccessV2,
  proposals: DashboardProjectionProposal[],
  waves: DashboardProjectionWave[],
): DashboardActionDTO[] {
  const actions: DashboardActionDTO[] = [];
  for (const proposal of proposals) {
    const href = `/proposals/${encodeURIComponent(proposal.id)}`;
    if (proposal.status === "draft" && proposal.ownerId === context.userId) {
      actions.push({ id: proposal.id, kind: "private_draft", title: "Tiếp tục đề xuất mua hàng", detail: "Bản nháp chỉ hiển thị với người tạo và chưa được gửi đi.", href, dueLabel: null });
      continue;
    }
    const assigned = (proposal.status === "pending_manager" && proposal.assignedManagerId === context.userId)
      || (proposal.status === "pending_executive" && proposal.assignedExecutiveId === context.userId);
    if (assigned) {
      actions.push({ id: proposal.id, kind: "approval", title: "Có đề xuất cần xử lý", detail: proposal.overPlan ? "Đề xuất vượt phần còn lại của PO; cần kiểm tra trước khi duyệt." : "Kiểm tra đề xuất và chọn PO ghi nhận.", href, dueLabel: "Cần xử lý" });
    }
    if (proposal.overPlan && ["pending_manager", "pending_executive", "approved"].includes(proposal.status)) {
      actions.push({ id: `${proposal.id}:over-plan`, kind: "over_plan", title: "Đề xuất vượt phần còn lại của PO", detail: "Đề xuất vẫn có thể duyệt nhưng bắt buộc theo tuyến hai cấp.", href, dueLabel: "Vượt kế hoạch" });
    }
  }
  for (const wave of waves) {
    if (wave.status !== "received" && wave.arrivalMonth && wave.arrivalMonth < new Date().toISOString().slice(0, 7)) {
      actions.push({ id: `${wave.id}:late`, kind: "late_wave", title: `PO #${wave.waveNumber} có nguy cơ chậm`, detail: `Tháng hàng về dự kiến ${wave.arrivalMonth} đã qua nhưng chưa ghi nhận nhận hàng.`, href: `/purchase-waves/${encodeURIComponent(wave.id)}`, dueLabel: "Cần theo dõi" });
    }
  }
  return actions.slice(0, 8);
}

function createExceptions(
  context: CurrentAccessV2,
  proposals: DashboardProjectionProposal[],
  waves: DashboardProjectionWave[],
  governance: DashboardProjectionGovernance | undefined,
): DashboardExceptionDTO[] {
  const exceptions: DashboardExceptionDTO[] = [];
  for (const proposal of proposals.filter((item) => item.overPlan && ["pending_manager", "pending_executive", "approved"].includes(item.status))) {
    exceptions.push({ id: `proposal:${proposal.id}`, severity: "critical", title: "Đề xuất vượt phần còn lại của PO", detail: "Cần kiểm tra năng lực PO và tuyến duyệt hai cấp.", href: `/proposals/${encodeURIComponent(proposal.id)}` });
  }
  for (const wave of waves.filter((item) => item.status !== "received" && item.arrivalMonth && item.arrivalMonth < new Date().toISOString().slice(0, 7))) {
    exceptions.push({ id: `wave:${wave.id}`, severity: "warning", title: `PO #${wave.waveNumber} chưa ghi nhận hàng về`, detail: `Dự kiến hàng về ${wave.arrivalMonth}; cập nhật trạng thái thực tế để theo dõi chính xác.`, href: `/purchase-waves/${encodeURIComponent(wave.id)}` });
  }
  if (context.isAdministrator && governance) {
    if (governance.activeUsersWithoutSupervisor > 0) exceptions.push({ id: "governance-users", severity: "warning", title: "Tài khoản đang thiếu người quản lý", detail: `${governance.activeUsersWithoutSupervisor} tài khoản active chưa có tuyến báo cáo hợp lệ.`, href: "/admin/users" });
    if (governance.brandsWithoutActivePolicy > 0) exceptions.push({ id: "governance-policy", severity: "warning", title: "Nhãn hàng chưa có chính sách duyệt", detail: `${governance.brandsWithoutActivePolicy} nhãn hàng cần được gắn chính sách duyệt.`, href: "/admin/approval-policies" });
    if (governance.pendingNotificationOutbox > 0) exceptions.push({ id: "governance-notifications", severity: "info", title: "Thông báo đang chờ phát", detail: `${governance.pendingNotificationOutbox} thông báo chưa được xử lý trong outbox.`, href: "/notifications" });
  }
  return exceptions.slice(0, 8);
}

export function projectRoleDashboard(
  context: CurrentAccessV2,
  brandId: string | null,
  planningYear: number,
  input: DashboardProjectionInput,
): RoleDashboardDTO {
  const scopedBrand = brandId ? context.brands.find((brand) => brand.id === brandId) : context.brands[0];
  const hasBaselineAccess = canViewBaseline(context, brandId);
  const lines = hasBaselineAccess
    ? input.baselineLines.filter((line) => line.revisionStatus === "approved" && scopeMatches(line, brandId, planningYear))
    : [];
  const waves = hasBaselineAccess
    ? input.waves.filter((wave) => wave.revisionStatus === "approved" && scopeMatches(wave, brandId, planningYear))
    : [];
  const proposals = input.proposals.filter((proposal) => {
    if (!scopeMatches(proposal, brandId, planningYear)) return false;
    if (proposal.ownerId === context.userId) return true;
    if (proposal.status === "pending_manager" && proposal.assignedManagerId === context.userId) return true;
    if (proposal.status === "pending_executive" && proposal.assignedExecutiveId === context.userId) return true;
    return hasBaselineAccess && ["approved", "rejected", "withdrawn", "cancelled"].includes(proposal.status);
  });
  const baselineAmount = lines.reduce((sum, line) => sum + numberValue(line.baselineAmount), 0);
  const allocatedAmount = lines.reduce((sum, line) => sum + numberValue(line.allocatedAmount), 0);
  const approvedProposalAmount = proposals.filter((proposal) => proposal.status === "approved").reduce((sum, proposal) => sum + numberValue(proposal.referenceAmount), 0);
  const overPlanAmount = proposals.filter((proposal) => proposal.overPlan && ["pending_manager", "pending_executive", "approved"].includes(proposal.status)).reduce((sum, proposal) => sum + numberValue(proposal.referenceAmount), 0);
  const metrics = hasBaselineAccess
    ? [
        metric("baseline", "Ngân sách kế hoạch", baselineAmount, `${lines.length} SKU trong baseline đã duyệt`, baselineAmount ? percent(allocatedAmount / baselineAmount * 100) : 0),
        metric("allocated", "Đã phân bổ vào PO", allocatedAmount, `${baselineAmount ? percent(allocatedAmount / baselineAmount * 100) : 0}% ngân sách đã gắn vào đợt mua`, baselineAmount ? percent(allocatedAmount / baselineAmount * 100) : 0),
        metric("approved_proposals", "Đề xuất đã duyệt", approvedProposalAmount, `${proposals.filter((proposal) => proposal.status === "approved").length} đề xuất`, null),
        metric("over_plan", "Vượt phần còn lại", overPlanAmount, overPlanAmount ? "Cần kiểm tra tuyến duyệt hai cấp" : "Chưa có ngoại lệ vượt kế hoạch", null),
      ]
    : [
        hiddenMetric("baseline", "Ngân sách kế hoạch"),
        hiddenMetric("allocated", "Đã phân bổ vào PO"),
        hiddenMetric("approved_proposals", "Đề xuất đã duyệt"),
        hiddenMetric("over_plan", "Vượt phần còn lại"),
      ];
  const actions = createActions(context, proposals, waves);
  const exceptions = createExceptions(context, proposals, waves, input.governance);
  return {
    context: { brandId, brandCode: scopedBrand?.code ?? input.baselineLines.find((line) => line.brandId === brandId)?.brandCode ?? null, planningYear, tier: context.tier },
    displayName: context.displayName,
    actions,
    metrics,
    waves: waves.map((wave) => ({ id: wave.id, name: `PO #${wave.waveNumber}`, arrivalMonth: wave.arrivalMonth, usedUnits: wave.usedUnits, plannedUnits: wave.plannedUnits, progress: wave.plannedUnits ? percent(wave.usedUnits / wave.plannedUnits * 100) : 0, status: wave.status, officialPoNumber: wave.officialPoNumber })),
    exceptions,
    canViewBaseline: hasBaselineAccess,
  };
}

function mapLine(value: unknown): DashboardProjectionLine {
  const row = value as ProjectionRow;
  const product = relation(row.products);
  return {
    brandId: text(row.brand_id), brandCode: text(row.brand_code), brandName: text(row.brand_name), planningYear: numberValue(row.planning_year), revisionId: text(row.revision_id), revisionStatus: text(row.revision_status), productId: text(row.product_id), sku: text(row.sku ?? product.canonical_sku), productName: text(row.product_name ?? product.name), annualPaidQty: numberValue(row.annual_paid_qty), annualFocQty: numberValue(row.annual_foc_qty), openingStock: numberValue(row.opening_stock), exPrice: text(row.ex_price), baselineAmount: text(row.baseline_amount), allocatedPaidQty: numberValue(row.allocated_paid_qty), allocatedFocQty: numberValue(row.allocated_foc_qty), allocatedAmount: text(row.allocated_amount),
  };
}

function mapWave(value: unknown): DashboardProjectionWave {
  const row = value as ProjectionRow;
  return { id: text(row.wave_id ?? row.id), brandId: text(row.brand_id), brandCode: text(row.brand_code), planningYear: numberValue(row.planning_year), revisionStatus: text(row.revision_status), waveNumber: numberValue(row.wave_number), status: text(row.status), orderMonth: text(row.order_month).slice(0, 7), arrivalMonth: text(row.arrival_month).slice(0, 7), officialPoNumber: nullableText(row.official_po_number), orderedAt: nullableText(row.ordered_at), supplierConfirmedAt: nullableText(row.supplier_confirmed_at), receivedAt: nullableText(row.received_at), plannedUnits: numberValue(row.planned_units), usedUnits: numberValue(row.used_units), amount: text(row.amount), };
}

function mapProposal(value: unknown): DashboardProjectionProposal {
  const row = value as ProjectionRow;
  return { id: text(row.proposal_id ?? row.id), brandId: text(row.brand_id), planningYear: numberValue(row.planning_year), status: text(row.status), ownerId: text(row.owner_id), assignedManagerId: nullableText(row.assigned_manager_id), assignedExecutiveId: nullableText(row.assigned_executive_id), neededMonth: text(row.needed_month).slice(0, 7), requestedUnits: numberValue(row.requested_units), referenceAmount: text(row.reference_amount), overPlan: Boolean(row.over_plan), routeReason: nullableText(row.route_reason), updatedAt: text(row.updated_at), };
}

export async function loadRoleDashboard(
  context: CurrentAccessV2,
  brandId: string | null,
  planningYear: number,
): Promise<RoleDashboardDTO> {
  const access = context;
  const allowedBrand = brandId == null || access.isAdministrator || access.brands.some((brand) => brand.id === brandId);
  if (!allowedBrand) return projectRoleDashboard(access, null, planningYear, { baselineLines: [], waves: [], proposals: [] });
  const supabase = await createServerSupabaseClient();
  const lineQuery = supabase.from("v2_dashboard_approved_plan_lines").select("*").eq("planning_year", planningYear);
  const waveQuery = supabase.from("v2_dashboard_purchase_waves").select("*").eq("planning_year", planningYear);
  const proposalQuery = supabase.from("v2_dashboard_proposal_activity").select("*").eq("planning_year", planningYear);
  if (brandId) {
    lineQuery.eq("brand_id", brandId);
    waveQuery.eq("brand_id", brandId);
    proposalQuery.eq("brand_id", brandId);
  }
  const governanceQuery = access.isAdministrator
    ? supabase.from("v2_dashboard_governance_signals").select("*").maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [{ data: lineRows }, { data: waveRows }, { data: proposalRows }, { data: governanceRow }] = await Promise.all([lineQuery, waveQuery, proposalQuery, governanceQuery]);
  const governance = governanceRow ? {
    activeUsersWithoutSupervisor: numberValue((governanceRow as ProjectionRow).active_users_without_supervisor),
    brandsWithoutActivePolicy: numberValue((governanceRow as ProjectionRow).brands_without_active_policy),
    pendingNotificationOutbox: numberValue((governanceRow as ProjectionRow).pending_notification_outbox),
  } : undefined;
  return projectRoleDashboard(access, brandId, planningYear, { baselineLines: (lineRows ?? []).map(mapLine), waves: (waveRows ?? []).map(mapWave), proposals: (proposalRows ?? []).map(mapProposal), governance });
}
