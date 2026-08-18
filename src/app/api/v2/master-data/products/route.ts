import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { mapProductDto, productInputSchema } from "@/features/master-data/contracts";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) { return apiError(status, code, message, correlationId, status >= 500, fieldErrors); }
async function auth(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) { const { data: { user } } = await supabase.auth.getUser(); if (!user) return 401; return 200; }
function statusFor(error: { code?: string; message?: string } | null | undefined): [number, string] { const message = error?.message ?? ""; if (error?.code === "23505" || message.includes("duplicate")) return [409, "DUPLICATE_SKU"]; if (message.includes("BRAND_ACCESS") || message.includes("forbidden")) return [403, "FORBIDDEN"]; return [422, "PRODUCT_SAVE_FAILED"]; }

export async function GET(request: Request) {
  const correlationId = randomUUID(); const query = z.object({ brandId: z.string().uuid(), includeInactive: z.enum(["true", "false"]).optional() }).safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!query.success) return fail(422, "VALIDATION_ERROR", "Cần chọn nhãn hàng hợp lệ.", correlationId);
  const supabase = await createServerSupabaseClient(); const authStatus = await auth(supabase); if (authStatus !== 200) return fail(authStatus, authStatus === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", authStatus === 401 ? "Phiên đăng nhập đã hết hạn." : "Bạn không có quyền xem SKU.", correlationId);
  const [planAccess, viewAccess, masterDataAccess] = await Promise.all([
    supabase.rpc("can_use_brand_capability", { p_brand_id: query.data.brandId, p_capability: "create_annual_plan" }),
    supabase.rpc("can_use_brand_capability", { p_brand_id: query.data.brandId, p_capability: "view_approved_plan" }),
    supabase.rpc("can_use_brand_capability", { p_brand_id: query.data.brandId, p_capability: "manage_master_data" }),
  ]);
  if ([planAccess, viewAccess, masterDataAccess].every((result) => result.error || result.data !== true)) return fail(403, "FORBIDDEN", "Bạn không có quyền xem SKU của nhãn hàng này.", correlationId);
  const { data, error } = await supabase.rpc("list_product_options_v2", { p_brand_id: query.data.brandId, p_include_inactive: query.data.includeInactive === "true" }); if (error) return fail(422, "PRODUCT_LIST_FAILED", "Không thể tải danh sách SKU.", correlationId);
  return NextResponse.json({ ok: true, data: (data as unknown[] ?? []).map((row: unknown) => mapProductDto(row as Record<string, unknown>)), correlationId }, { status: 200 });
}

export async function POST(request: Request) {
  const correlationId = randomUUID(); const parsed = productInputSchema.safeParse(await parseJson<unknown>(request)); if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thông tin SKU chưa hợp lệ.", correlationId, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  const supabase = await createServerSupabaseClient(); const authStatus = await auth(supabase); if (authStatus !== 200) return fail(authStatus, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const [planAccess, masterDataAccess] = await Promise.all([
    supabase.rpc("can_use_brand_capability", { p_brand_id: parsed.data.brandId, p_capability: "create_annual_plan" }),
    supabase.rpc("can_use_brand_capability", { p_brand_id: parsed.data.brandId, p_capability: "manage_master_data" }),
  ]);
  if ((planAccess.error || planAccess.data !== true) && (masterDataAccess.error || masterDataAccess.data !== true)) return fail(403, "FORBIDDEN", "Bạn không có quyền thêm SKU cho nhãn hàng này.", correlationId);
  const { data, error } = await supabase.rpc("create_product_v2", { p_brand_id: parsed.data.brandId, p_sku: parsed.data.sku, p_name: parsed.data.name, p_aliases: parsed.data.aliases, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) { const [status, code] = statusFor(error); return fail(status, code, status === 409 ? "Mã SKU đã tồn tại." : "Không thể lưu SKU.", correlationId); }
  return NextResponse.json({ ok: true, data: mapProductDto((data ?? {}) as Record<string, unknown>), correlationId }, { status: 201 });
}
