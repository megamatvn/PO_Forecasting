import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAnnualPlanExcelTemplate, type ExcelTemplateContext } from "@/features/annual-plans/excel/template";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

type RevisionRow = {
  id: string;
  cycle_id: string;
  owner_id: string;
  status: string;
  lock_version: number;
  annual_plan_cycles?: { brand_id?: string; planning_year?: number; brands?: { id?: string; code?: string; name?: string } | Array<{ id?: string; code?: string; name?: string }> | null } | Array<{ brand_id?: string; planning_year?: number; brands?: { id?: string; code?: string; name?: string } | Array<{ id?: string; code?: string; name?: string }> | null }> | null;
};

function errorResponse(status: number, code: string, message: string, correlationId: string) {
  return Response.json({ ok: false, error: { code, message, retryable: false, correlationId } }, { status });
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!uuidSchema.safeParse(revisionId).success) return errorResponse(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);

  const supabase = await createServerSupabaseClient();
  const [{ data: userResult }, { data: revision, error: revisionError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("annual_plan_revisions").select("id, cycle_id, owner_id, status, lock_version, annual_plan_cycles(brand_id, planning_year, brands(id, code, name))").eq("id", revisionId).maybeSingle(),
  ]);
  const user = userResult.user;
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  if (revisionError || !revision) return errorResponse(404, "ANNUAL_PLAN_NOT_FOUND", "Không tìm thấy bản kế hoạch.", correlationId);

  const revisionRow = revision as unknown as RevisionRow;
  if (revisionRow.owner_id !== user.id || revisionRow.status !== "draft_owner_only") return errorResponse(403, "ANNUAL_PLAN_DRAFT_FORBIDDEN", "Chỉ chủ sở hữu bản nháp mới có thể tải file mẫu.", correlationId);
  const cycle = unwrap(revisionRow.annual_plan_cycles);
  const brand = unwrap(cycle?.brands);
  if (!cycle?.brand_id || !cycle.planning_year || !brand?.code) return errorResponse(422, "ANNUAL_PLAN_SCOPE_INCOMPLETE", "Bản nháp chưa có đủ thông tin nhãn hàng và năm kế hoạch.", correlationId);

  const [{ data: lineRows }, { data: waveRows }] = await Promise.all([
    supabase.from("annual_plan_lines").select("product_id, annual_paid_qty, annual_foc_qty, opening_stock, ex_price, products(canonical_sku, name)").eq("revision_id", revisionId),
    supabase.from("purchase_wave_revisions").select("id, wave_id, order_month, arrival_month, needed_month, purchase_waves(wave_number), purchase_wave_allocations(product_id, paid_qty, foc_qty, ex_price, products(canonical_sku, name))").eq("revision_id", revisionId),
  ]);

  const lines = ((lineRows ?? []) as Array<{ product_id: string; annual_paid_qty: number; annual_foc_qty: number; opening_stock: number; ex_price: string; products?: { canonical_sku?: string; name?: string } | Array<{ canonical_sku?: string; name?: string }> | null }>).map((line) => {
    const product = unwrap(line.products);
    return { productId: line.product_id, sku: String(product?.canonical_sku ?? ""), name: String(product?.name ?? ""), exPrice: String(line.ex_price ?? "0"), paidQty: Number(line.annual_paid_qty ?? 0), expectedFoc: Number(line.annual_foc_qty ?? 0), openingStock: Number(line.opening_stock ?? 0) };
  });
  const waves = ((waveRows ?? []) as Array<{ id: string; wave_id: string; order_month?: string; arrival_month?: string; needed_month?: string; purchase_waves?: { wave_number?: number } | Array<{ wave_number?: number }>; purchase_wave_allocations?: Array<{ product_id: string; paid_qty: number; foc_qty: number; ex_price: string; products?: { canonical_sku?: string; name?: string } | Array<{ canonical_sku?: string; name?: string }> | null }> }>).map((wave) => ({
    id: wave.wave_id,
    sequence: Number(unwrap(wave.purchase_waves)?.wave_number ?? 0),
    orderMonth: String(wave.order_month ?? wave.needed_month ?? "").slice(0, 7),
    arrivalMonth: String(wave.arrival_month ?? wave.needed_month ?? "").slice(0, 7),
    allocations: (wave.purchase_wave_allocations ?? []).map((allocation) => {
      const product = unwrap(allocation.products);
      return { productId: allocation.product_id, sku: String(product?.canonical_sku ?? ""), paidQty: Number(allocation.paid_qty ?? 0), focQty: Number(allocation.foc_qty ?? 0), exPrice: String(allocation.ex_price ?? "0") };
    }),
  }));
  const context: ExcelTemplateContext = {
    revisionId,
    lockVersion: Number(revisionRow.lock_version ?? 0),
    brand: { id: cycle.brand_id, code: brand.code, name: String(brand.name ?? "") },
    planningYear: Number(cycle.planning_year),
    lines,
    waves,
  };
  const workbook = await createAnnualPlanExcelTemplate(context);
  const safeCode = brand.code.replace(/[^A-Z0-9_-]/gi, "_");
  return new NextResponse(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Sagen_${safeCode}_${context.planningYear}_Ke_hoach_mua_hang.xlsx"`,
      "cache-control": "private, no-store",
      "x-correlation-id": correlationId,
    },
  });
}
