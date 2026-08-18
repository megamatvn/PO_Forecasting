import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const scopeSchema = z.object({
  expectedLockVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});

function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) {
  return apiError(status, code, message, correlationId, status >= 500, fieldErrors);
}

function mapRpcError(error: { code?: string | null; message?: string | null } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (message.includes("LOCK_CONFLICT")) return [409, "ANNUAL_PLAN_LOCK_CONFLICT", "Bản kế hoạch đã thay đổi. Hãy tải lại trước khi lưu tiếp."];
  if (message.includes("DRAFT_FORBIDDEN") || error?.code === "42501") return [403, "ANNUAL_PLAN_DRAFT_FORBIDDEN", "Bạn không có quyền chỉnh sửa bản nháp này."];
  return [422, "ANNUAL_PLAN_SCOPE_SAVE_FAILED", "Không thể lưu phạm vi kế hoạch."];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ revisionId: string }> },
) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!z.string().uuid().safeParse(revisionId).success) return fail(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);
  const parsed = scopeSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thông tin lưu phạm vi chưa hợp lệ.", correlationId, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const { data, error } = await supabase.rpc("save_annual_plan_scope_v2", {
    p_revision_id: revisionId,
    p_expected_lock_version: parsed.data.expectedLockVersion,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const [status, code, message] = mapRpcError(error);
    return fail(status, code, message, correlationId);
  }
  return NextResponse.json({ ok: true, data, correlationId }, { status: 200 });
}
