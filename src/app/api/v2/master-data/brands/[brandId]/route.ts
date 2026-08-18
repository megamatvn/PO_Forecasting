import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { brandInputSchema, mapBrandDto } from "@/features/master-data/contracts";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
interface Context { params: Promise<{ brandId: string }> }
function fail(status: number, code: string, message: string, correlationId: string) { return apiError(status, code, message, correlationId, status >= 500); }
async function authAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) { const { data: { user } } = await supabase.auth.getUser(); if (!user) return 401; const check = await supabase.rpc("current_user_has_capability", { p_capability: "administer_system" }); return check.data === true && !check.error ? 200 : 403; }
function errorStatus(error: { code?: string; message?: string } | null | undefined): [number, string] { const message = error?.message ?? ""; return error?.code === "23505" || message.includes("duplicate") ? [409, "DUPLICATE_BRAND"] : message.includes("DEPENDENT") ? [409, "BRAND_HAS_DEPENDENTS"] : [422, "BRAND_UPDATE_FAILED"]; }

export async function PATCH(request: Request, context: Context) {
  const correlationId = randomUUID(); const { brandId } = await context.params;
  if (!uuid.safeParse(brandId).success) return fail(422, "VALIDATION_ERROR", "Nhãn hàng không hợp lệ.", correlationId);
  const body = await parseJson<unknown>(request); const parsed = brandInputSchema.extend({ isActive: z.boolean().optional() }).safeParse(body);
  if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thông tin nhãn hàng chưa hợp lệ.", correlationId);
  const supabase = await createServerSupabaseClient(); const auth = await authAdmin(supabase); if (auth !== 200) return fail(auth, auth === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", auth === 401 ? "Phiên đăng nhập đã hết hạn." : "Chỉ Administrator được quản lý nhãn hàng.", correlationId);
  const { data, error } = await supabase.rpc("update_brand_v2", { p_brand_id: brandId, p_code: parsed.data.code, p_name: parsed.data.name, p_is_active: parsed.data.isActive ?? true, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) { const [status, code] = errorStatus(error); return fail(status, code, "Không thể cập nhật nhãn hàng.", correlationId); }
  return NextResponse.json({ ok: true, data: mapBrandDto((data ?? {}) as Record<string, unknown>), correlationId }, { status: 200 });
}

export async function DELETE(request: Request, context: Context) {
  const correlationId = randomUUID(); const { brandId } = await context.params; if (!uuid.safeParse(brandId).success) return fail(422, "VALIDATION_ERROR", "Nhãn hàng không hợp lệ.", correlationId);
  const body = await parseJson<unknown>(request); const parsed = z.object({ idempotencyKey: uuid }).safeParse(body); if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thiếu khóa giao dịch.", correlationId);
  const supabase = await createServerSupabaseClient(); const auth = await authAdmin(supabase); if (auth !== 200) return fail(auth, auth === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", auth === 401 ? "Phiên đăng nhập đã hết hạn." : "Chỉ Administrator được quản lý nhãn hàng.", correlationId);
  const { data, error } = await supabase.rpc("update_brand_v2", { p_brand_id: brandId, p_code: null, p_name: null, p_is_active: false, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) { const [status, code] = errorStatus(error); return fail(status, code, "Không thể ngừng sử dụng nhãn hàng.", correlationId); }
  return NextResponse.json({ ok: true, data: mapBrandDto((data ?? {}) as Record<string, unknown>), correlationId }, { status: 200 });
}
