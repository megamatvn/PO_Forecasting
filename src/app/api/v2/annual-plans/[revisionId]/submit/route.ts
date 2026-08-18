import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const submitSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});

function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) {
  return apiError(status, code, message, correlationId, status >= 500, fieldErrors);
}

function mapError(error: { code?: string | null; message?: string | null } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (message.includes("LOCK_CONFLICT")) return [409, "ANNUAL_PLAN_LOCK_CONFLICT", "Bản kế hoạch đã thay đổi. Hãy tải lại trước khi gửi duyệt."];
  if (message.includes("ALLOCATION_MISMATCH")) return [422, "ANNUAL_PLAN_ALLOCATION_MISMATCH", "Tổng Qty và FOC của các đợt mua phải khớp kế hoạch năm."];
  if (message.includes("EXECUTIVE_REQUIRED")) return [422, "ANNUAL_PLAN_EXECUTIVE_REQUIRED", "Chưa xác định được CEO/BOD phụ trách để nhận duyệt."];
  if (message.includes("SUBMIT_FORBIDDEN") || message.includes("DRAFT_FORBIDDEN") || error?.code === "42501") return [403, "ANNUAL_PLAN_SUBMIT_FORBIDDEN", "Bạn không có quyền gửi bản kế hoạch này."];
  if (message.includes("ALREADY_SUBMITTED")) return [409, "ANNUAL_PLAN_ALREADY_SUBMITTED", "Bản kế hoạch này đã được gửi duyệt."];
  if (message.includes("NO_LINES") || message.includes("NO_WAVES") || message.includes("VALIDATION")) return [422, "ANNUAL_PLAN_SUBMIT_INVALID", "Bản kế hoạch chưa đủ dữ liệu để gửi duyệt."];
  return [422, "ANNUAL_PLAN_SUBMIT_FAILED", "Không thể gửi bản kế hoạch để phê duyệt."];
}

export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!z.string().uuid().safeParse(revisionId).success) return fail(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);
  const raw = await parseJson<unknown>(request);
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thông tin gửi duyệt chưa hợp lệ.", correlationId, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const { data, error } = await supabase.rpc("submit_annual_plan_v2", {
    p_revision_id: revisionId,
    p_expected_lock_version: parsed.data.lockVersion,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const [status, code, message] = mapError(error);
    return fail(status, code, message, correlationId);
  }
  return NextResponse.json({ ok: true, data, correlationId }, { status: 200 });
}
