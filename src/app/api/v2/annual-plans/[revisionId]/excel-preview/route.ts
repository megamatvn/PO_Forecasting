import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseAnnualPlanWorkbook, type ExcelPreviewDTO } from "@/features/annual-plans/excel/parser";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;

function errorResponse(status: number, code: string, message: string, correlationId: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: { code, message, retryable: false, correlationId }, ...extra }, { status });
}

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && typeof value.arrayBuffer === "function");
}

export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!uuidSchema.safeParse(revisionId).success) return errorResponse(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);
  let formData: FormData;
  try { formData = await request.formData(); } catch { return errorResponse(400, "INVALID_FORM", "Dữ liệu tải file không hợp lệ.", correlationId); }
  const file = formData.get("file");
  if (!isFile(file) || !file.name.toLowerCase().endsWith(".xlsx")) return errorResponse(422, "INVALID_FILE", "Chỉ hỗ trợ file Excel .xlsx.", correlationId);
  if (file.size > MAX_WORKBOOK_BYTES) return errorResponse(422, "FILE_TOO_LARGE", "File Excel không được vượt quá 10 MB.", correlationId);

  const supabase = await createServerSupabaseClient();
  const [{ data: userResult }, { data: revision, error: revisionError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("annual_plan_revisions").select("id, owner_id, status, lock_version, annual_plan_cycles(brand_id, planning_year)").eq("id", revisionId).maybeSingle(),
  ]);
  const user = userResult.user;
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  if (revisionError || !revision) return errorResponse(404, "ANNUAL_PLAN_NOT_FOUND", "Không tìm thấy bản kế hoạch.", correlationId);
  const revisionRow = revision as unknown as { owner_id: string; status: string; lock_version: number; annual_plan_cycles?: { brand_id?: string; planning_year?: number } | Array<{ brand_id?: string; planning_year?: number }> | null };
  const cycle = Array.isArray(revisionRow.annual_plan_cycles) ? revisionRow.annual_plan_cycles[0] : revisionRow.annual_plan_cycles;
  if (revisionRow.owner_id !== user.id || revisionRow.status !== "draft_owner_only") return errorResponse(403, "ANNUAL_PLAN_DRAFT_FORBIDDEN", "Chỉ chủ sở hữu bản nháp mới có thể nhập Excel.", correlationId);
  if (!cycle?.brand_id || !cycle.planning_year) return errorResponse(422, "ANNUAL_PLAN_SCOPE_INCOMPLETE", "Bản nháp chưa có đủ thông tin phạm vi.", correlationId);

  const { data: products } = await supabase.from("products").select("id, canonical_sku, is_active").eq("brand_id", cycle.brand_id);
  const productRows = (products ?? []) as Array<{ id: string; canonical_sku: string; is_active: boolean }>;
  const productIds = productRows.map((product) => product.id);
  const { data: aliases } = productIds.length
    ? await supabase.from("sku_aliases").select("alias_sku, product_id").in("product_id", productIds)
    : { data: [] as Array<{ alias_sku: string; product_id: string }> };
  const canonicalByProductId = new Map(productRows.map((product) => [product.id, product.canonical_sku.toUpperCase()]));
  const productIdByCanonicalSku = new Map(productRows.map((product) => [product.canonical_sku.toUpperCase(), product.id]));
  const skuAliases = new Map<string, string>();
  productRows.forEach((product) => skuAliases.set(product.canonical_sku.toUpperCase(), product.canonical_sku.toUpperCase()));
  ((aliases ?? []) as Array<{ alias_sku: string; product_id: string }>).forEach((alias) => { const canonical = canonicalByProductId.get(alias.product_id); if (canonical) skuAliases.set(alias.alias_sku.toUpperCase(), canonical); });
  const knownSkus = new Set(productRows.filter((product) => product.is_active).map((product) => product.canonical_sku.toUpperCase()));

  let preview: ExcelPreviewDTO;
  try {
    preview = await parseAnnualPlanWorkbook(Buffer.from(await file.arrayBuffer()), {
      expectedBrandId: cycle.brand_id,
      expectedPlanningYear: Number(cycle.planning_year),
      knownSkus,
      skuAliases,
      skuProductIds: productIdByCanonicalSku,
    });
  } catch {
    return errorResponse(422, "INVALID_WORKBOOK", "Không thể đọc file Excel. Vui lòng tải đúng mẫu Sagen.", correlationId);
  }
  const payload = preview as unknown as Record<string, unknown>;
  const { error: stagingError } = await supabase.rpc("stage_annual_plan_excel_v2", {
    p_revision_id: revisionId,
    p_lock_version: Number(revisionRow.lock_version ?? preview.lockVersion),
    p_import_session_id: preview.importSessionId,
    p_checksum: preview.checksum,
    p_payload: payload,
    p_diagnostics: preview.diagnostics,
  });
  if (stagingError) return errorResponse(500, "EXCEL_STAGING_FAILED", "Không thể lưu bản xem trước Excel.", correlationId);
  return NextResponse.json({ ok: true, data: preview, correlationId }, { status: 201 });
}
