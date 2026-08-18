import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const decisionSchema = z.object({
  decision: z.enum(["approve", "request_changes", "reject"]),
  comment: z.string().trim().max(1000).optional().default(""),
  idempotencyKey: z.string().uuid(),
});

function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) {
  return apiError(status, code, message, correlationId, status >= 500, fieldErrors);
}

function mapError(error: { code?: string | null; message?: string | null } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (message.includes("ASSIGNEE") || message.includes("DECISION_FORBIDDEN") || error?.code === "42501") return [403, "ANNUAL_PLAN_DECISION_FORBIDDEN", "Bạn không được giao xử lý bản kế hoạch này."];
  if (message.includes("LOCK_CONFLICT")) return [409, "ANNUAL_PLAN_LOCK_CONFLICT", "Bản kế hoạch đã thay đổi. Hãy tải lại trước khi xử lý."];
  if (message.includes("ALREADY_DECIDED")) return [409, "ANNUAL_PLAN_ALREADY_DECIDED", "Bản kế hoạch đã được xử lý trước đó."];
  if (message.includes("COMMENT_REQUIRED")) return [422, "ANNUAL_PLAN_COMMENT_REQUIRED", "Vui lòng ghi lý do khi yêu cầu chỉnh sửa hoặc từ chối."];
  return [422, "ANNUAL_PLAN_DECISION_FAILED", "Không thể ghi nhận quyết định phê duyệt."];
}

export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!z.string().uuid().safeParse(revisionId).success) return fail(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);
  const parsed = decisionSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Quyết định phê duyệt chưa hợp lệ.", correlationId, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  if (parsed.data.decision !== "approve" && !parsed.data.comment) return fail(422, "ANNUAL_PLAN_COMMENT_REQUIRED", "Vui lòng ghi lý do khi yêu cầu chỉnh sửa hoặc từ chối.", correlationId);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const { data, error } = await supabase.rpc("decide_annual_plan_v2", {
    p_revision_id: revisionId,
    p_decision: parsed.data.decision,
    p_comment: parsed.data.comment,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const [status, code, message] = mapError(error);
    return fail(status, code, message, correlationId);
  }
  return NextResponse.json({ ok: true, data, correlationId }, { status: 200 });
}
