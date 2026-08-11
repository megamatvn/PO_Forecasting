import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({
  userId: z.string().regex(UUID_PATTERN),
  roles: z
    .array(z.enum(["administrator", "planner", "approver_l1", "approver_l2", "viewer"]))
    .min(1),
  brandIds: z.array(z.string().regex(UUID_PATTERN)).min(1),
  isActive: z.boolean(),
  idempotencyKey: z.string().regex(UUID_PATTERN),
});

function errorResponse(status: number, code: string, message: string, correlationId: string) {
  return NextResponse.json({ code, message, correlationId }, { status });
}

export async function POST(request: Request) {
  const correlationId = randomUUID();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Nội dung yêu cầu không hợp lệ.", correlationId);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "invalid_access", "Vai trò hoặc nhãn hàng không hợp lệ.", correlationId);
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.", correlationId);

  const { data, error } = await supabase.rpc("set_user_access", {
    p_user_id: parsed.data.userId,
    p_roles: parsed.data.roles,
    p_brand_ids: parsed.data.brandIds,
    p_is_active: parsed.data.isActive,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (!error && data) return NextResponse.json({ updated: true });

  console.error("set_user_access RPC failed", {
    correlationId,
    userId: parsed.data.userId,
    databaseCode: error?.code ?? "unknown",
  });
  const forbidden = error?.message.includes("admin_required") ||
    error?.message.includes("cannot_remove_own_admin") ||
    error?.message.includes("last_administrator_required") ||
    error?.message.includes("target_out_of_scope");
  return errorResponse(
    forbidden ? 403 : 422,
    forbidden ? "forbidden" : "update_failed",
    forbidden
      ? "Bạn không thể thực hiện thay đổi quyền này."
      : "Không thể cập nhật quyền. Cấu hình cũ chưa bị thay đổi.",
    correlationId,
  );
}
