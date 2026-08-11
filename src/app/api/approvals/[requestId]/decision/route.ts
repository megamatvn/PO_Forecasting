import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z
  .object({
    action: z.enum(["approve", "request_changes"]),
    comment: z.string().max(2000).default(""),
    idempotencyKey: z.string().regex(UUID_PATTERN),
  })
  .superRefine((value, context) => {
    if (value.action === "request_changes" && !value.comment.trim()) {
      context.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Lý do yêu cầu chỉnh sửa là bắt buộc.",
      });
    }
  });

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { code, message, correlationId: randomUUID() },
    { status },
  );
}

interface RouteContext {
  params: Promise<{ requestId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  if (!UUID_PATTERN.test(requestId)) {
    return errorResponse(400, "invalid_request", "Mã hồ sơ duyệt không hợp lệ.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Nội dung yêu cầu không hợp lệ.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_decision",
      parsed.error.issues[0]?.message ?? "Quyết định duyệt không hợp lệ.",
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.");
  }

  const rpcName =
    parsed.data.action === "approve" ? "approve_step" : "request_changes";
  const { data: status, error } = await supabase.rpc(rpcName, {
    p_approval_request_id: requestId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_comment: parsed.data.comment.trim() || null,
  });

  if (!error && status) {
    return NextResponse.json({ status });
  }

  if (error?.message.includes("approval_step_forbidden")) {
    return errorResponse(
      403,
      "forbidden",
      "Bạn không có quyền quyết định tại cấp duyệt hiện tại.",
    );
  }

  return errorResponse(
    422,
    "decision_failed",
    "Không thể ghi nhận quyết định. Hồ sơ chưa bị thay đổi.",
  );
}
