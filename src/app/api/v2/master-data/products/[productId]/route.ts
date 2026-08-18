import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { mapProductDto, productInputSchema } from "@/features/master-data/contracts";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuid = z.string().uuid(); interface Context { params: Promise<{ productId: string }> }
function fail(status: number, code: string, message: string, correlationId: string) { return apiError(status, code, message, correlationId, status >= 500); }
async function authorized(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) { const { data: { user } } = await supabase.auth.getUser(); if (!user) return 401; return 200; }

export async function PATCH(request: Request, context: Context) {
  const correlationId = randomUUID(); const { productId } = await context.params; if (!uuid.safeParse(productId).success) return fail(422, "VALIDATION_ERROR", "SKU không hợp lệ.", correlationId);
  const parsed = productInputSchema.extend({ isActive: z.boolean().optional() }).safeParse(await parseJson<unknown>(request)); if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thông tin SKU chưa hợp lệ.", correlationId);
  const supabase = await createServerSupabaseClient(); const status = await authorized(supabase); if (status !== 200) return fail(status, status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", status === 401 ? "Phiên đăng nhập đã hết hạn." : "Bạn không có quyền sửa SKU.", correlationId);
  const access = await supabase.rpc("can_use_brand_capability", { p_brand_id: parsed.data.brandId, p_capability: "manage_master_data" }); if (access.error || access.data !== true) return fail(403, "FORBIDDEN", "Bạn không có quyền sửa SKU của nhãn hàng này.", correlationId);
  const { data, error } = await supabase.rpc("update_product_v2", { p_product_id: productId, p_brand_id: parsed.data.brandId, p_sku: parsed.data.sku, p_name: parsed.data.name, p_aliases: parsed.data.aliases, p_is_active: parsed.data.isActive ?? true, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) return fail(error.code === "23505" ? 409 : 422, error.code === "23505" ? "DUPLICATE_SKU" : "PRODUCT_UPDATE_FAILED", "Không thể cập nhật SKU.", correlationId);
  return NextResponse.json({ ok: true, data: mapProductDto((data ?? {}) as Record<string, unknown>), correlationId }, { status: 200 });
}

export async function DELETE(request: Request, context: Context) {
  const correlationId = randomUUID(); const { productId } = await context.params; if (!uuid.safeParse(productId).success) return fail(422, "VALIDATION_ERROR", "SKU không hợp lệ.", correlationId);
  const parsed = z.object({ brandId: uuid, idempotencyKey: uuid }).safeParse(await parseJson<unknown>(request)); if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thiếu nhãn hàng hoặc khóa giao dịch.", correlationId);
  const supabase = await createServerSupabaseClient(); const status = await authorized(supabase); if (status !== 200) return fail(status, status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", status === 401 ? "Phiên đăng nhập đã hết hạn." : "Bạn không có quyền ngừng SKU.", correlationId);
  const access = await supabase.rpc("can_use_brand_capability", { p_brand_id: parsed.data.brandId, p_capability: "manage_master_data" }); if (access.error || access.data !== true) return fail(403, "FORBIDDEN", "Bạn không có quyền ngừng SKU của nhãn hàng này.", correlationId);
  const { data, error } = await supabase.rpc("update_product_v2", { p_product_id: productId, p_brand_id: parsed.data.brandId, p_sku: null, p_name: null, p_aliases: [], p_is_active: false, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) return fail(error.message?.includes("DEPENDENT") ? 409 : 422, error.message?.includes("DEPENDENT") ? "PRODUCT_HAS_DEPENDENTS" : "PRODUCT_UPDATE_FAILED", "Không thể ngừng SKU.", correlationId);
  return NextResponse.json({ ok: true, data: mapProductDto((data ?? {}) as Record<string, unknown>), correlationId }, { status: 200 });
}
