import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exceptionFlagsSchema = z.record(z.string().min(1).max(80), z.boolean());
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preview"),
    exceptionFlags: exceptionFlagsSchema.default({}),
  }),
  z.object({
    action: z.literal("submit"),
    exceptionFlags: exceptionFlagsSchema.default({}),
    idempotencyKey: z.string().regex(UUID_PATTERN),
  }),
]);

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { code, message, correlationId: randomUUID() },
    { status },
  );
}

interface RouteContext {
  params: Promise<{ planVersionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { planVersionId } = await context.params;
  if (!UUID_PATTERN.test(planVersionId)) {
    return errorResponse(400, "invalid_request", "Mã phiên bản không hợp lệ.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Nội dung yêu cầu không hợp lệ.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "invalid_submission", "Yêu cầu gửi duyệt không hợp lệ.");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.");
  }

  if (parsed.data.action === "preview") {
    const { data: route, error } = await supabase.rpc(
      "preview_plan_approval_route",
      {
        p_plan_version_id: planVersionId,
        p_exception_flags: parsed.data.exceptionFlags,
      },
    );
    if (!error && route) return NextResponse.json({ route });

    return errorResponse(
      error?.message.includes("forbidden") ? 403 : 422,
      "preview_failed",
      "Không thể xác định luồng duyệt cho kế hoạch này.",
    );
  }

  const { data: requestId, error } = await supabase.rpc("submit_plan", {
    p_plan_version_id: planVersionId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_exception_flags: parsed.data.exceptionFlags,
  });
  if (!error && requestId) return NextResponse.json({ requestId });

  if (error?.message.includes("missing_ex_price")) {
    return errorResponse(
      422,
      "missing_ex_price",
      "Không thể gửi duyệt vì vẫn còn sản phẩm có số lượng nhưng chưa có đơn giá xuất xưởng.",
    );
  }

  return errorResponse(
    error?.message.includes("forbidden") ? 403 : 422,
    "submission_failed",
    "Không thể gửi duyệt. Kế hoạch chưa bị thay đổi.",
  );
}
