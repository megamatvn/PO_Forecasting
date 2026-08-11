import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestSchema = z.object({
  planVersionId: z.string().regex(UUID_PATTERN),
  idempotencyKey: z.string().regex(UUID_PATTERN),
});

function errorResponse(status: number, code: string, message: string, correlationId = randomUUID()) {
  return NextResponse.json({ code, message, correlationId }, { status });
}

interface RouteContext {
  params: Promise<{ planVersionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const correlationId = randomUUID();
  const { planVersionId } = await context.params;
  if (!UUID_PATTERN.test(planVersionId)) {
    return errorResponse(400, "invalid_request", "Mã phiên bản không hợp lệ.", correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Nội dung yêu cầu không hợp lệ.", correlationId);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success || parsed.data.planVersionId !== planVersionId) {
    return errorResponse(400, "invalid_revision", "Yêu cầu tạo phiên bản chỉnh sửa không hợp lệ.", correlationId);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.", correlationId);
  }

  const { data: revisionId, error } = await supabase.rpc("create_plan_revision", {
    p_source_plan_version_id: planVersionId,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (!error && typeof revisionId === "string") {
    return NextResponse.json({ revisionId, correlationId });
  }

  const message = error?.message ?? "";
  if (message.includes("create_revision_forbidden")) {
    return errorResponse(403, "forbidden", "Bạn không có quyền tạo phiên bản cho nhãn hàng này.", correlationId);
  }
  if (message.includes("revision_source_must_be_approved_or_changes_requested")) {
    return errorResponse(409, "revision_source_invalid", "Chỉ phiên bản đã duyệt hoặc yêu cầu chỉnh sửa mới được tạo revision.", correlationId);
  }
  if (message.includes("idempotency_key_reused")) {
    return errorResponse(409, "idempotency_key_reused", "Khóa thao tác đã được sử dụng cho yêu cầu khác.", correlationId);
  }
  if (message.includes("plan_version_not_found")) {
    return errorResponse(404, "not_found", "Không tìm thấy phiên bản kế hoạch.", correlationId);
  }

  console.error("create_plan_revision RPC failed", {
    correlationId,
    planVersionId,
    databaseCode: error?.code ?? "unknown",
  });
  return errorResponse(422, "revision_failed", "Không thể tạo phiên bản chỉnh sửa. Bản gốc chưa bị thay đổi.", correlationId);
}
