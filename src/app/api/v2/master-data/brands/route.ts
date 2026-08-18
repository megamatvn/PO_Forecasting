import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { brandInputSchema, mapBrandDto } from "@/features/master-data/contracts";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const querySchema = z.object({ includeInactive: z.enum(["true", "false"]).optional() });

function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) {
  return apiError(status, code, message, correlationId, status >= 500, fieldErrors);
}
async function canCreateBrand(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 401 as const, user: null };
  const [planCapability, adminCapability] = await Promise.all([
    supabase.rpc("current_user_has_capability", { p_capability: "create_annual_plan" }),
    supabase.rpc("current_user_has_capability", { p_capability: "administer_system" }),
  ]);
  const masterDataCapability = await supabase.rpc("current_user_has_capability", { p_capability: "manage_master_data" });
  return (planCapability.data === true && !planCapability.error)
    || (adminCapability.data === true && !adminCapability.error)
    || (masterDataCapability.data === true && !masterDataCapability.error)
    ? { status: 200 as const, user }
    : { status: 403 as const, user: null };
}
function rpcStatus(error: { code?: string; message?: string } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (error?.code === "23505" || message.includes("duplicate") || message.includes("already")) return [409, "DUPLICATE_BRAND", "Mã nhãn hàng đã tồn tại."];
  if (message.includes("BRAND_ADMIN_REQUIRED") || message.includes("BRAND_CREATE_REQUIRED") || message.includes("forbidden")) return [403, "FORBIDDEN", "Bạn chưa được cấp quyền tạo nhãn hàng."];
  return [422, "BRAND_SAVE_FAILED", "Không thể lưu nhãn hàng."];
}

export async function GET(request: Request) {
  const correlationId = randomUUID();
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return fail(422, "VALIDATION_ERROR", "Bộ lọc nhãn hàng không hợp lệ.", correlationId);
  const supabase = await createServerSupabaseClient();
  const auth = await canCreateBrand(supabase);
  if (!auth.user) return fail(auth.status, auth.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", auth.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Bạn chưa được cấp quyền tạo nhãn hàng.", correlationId);
  const { data, error } = await supabase.rpc("list_brand_options_v2", { p_include_inactive: query.data.includeInactive === "true" });
  if (error) return fail(422, "BRAND_LIST_FAILED", "Không thể tải danh sách nhãn hàng.", correlationId);
  return NextResponse.json({ ok: true, data: (data as unknown[] ?? []).map((row: unknown) => mapBrandDto(row as Record<string, unknown>)), correlationId }, { status: 200 });
}

export async function POST(request: Request) {
  const correlationId = randomUUID();
  const parsed = brandInputSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thông tin nhãn hàng chưa hợp lệ.", correlationId, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  const supabase = await createServerSupabaseClient();
  const auth = await canCreateBrand(supabase);
  if (!auth.user) return fail(auth.status, auth.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", auth.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Bạn chưa được cấp quyền tạo nhãn hàng.", correlationId);
  const { data, error } = await supabase.rpc("create_brand_v2", { p_code: parsed.data.code, p_name: parsed.data.name, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) { const [status, code, message] = rpcStatus(error); return fail(status, code, message, correlationId); }
  return NextResponse.json({ ok: true, data: mapBrandDto((data ?? {}) as Record<string, unknown>), correlationId }, { status: 201 });
}
