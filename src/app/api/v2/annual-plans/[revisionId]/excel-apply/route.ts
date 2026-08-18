import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const applySchema = z.object({
  importSessionId: z.string().uuid(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  lockVersion: z.number().int().nonnegative(),
  replaceSections: z.tuple([z.literal("lines"), z.literal("waves")]),
  idempotencyKey: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function errorResponse(status: number, code: string, message: string, correlationId: string) {
  return NextResponse.json({ ok: false, error: { code, message, retryable: status >= 500, correlationId } }, { status });
}

function mapApplyError(message: string, correlationId: string) {
  if (message.includes("ANNUAL_PLAN_DRAFT_FORBIDDEN")) return errorResponse(403, "ANNUAL_PLAN_DRAFT_FORBIDDEN", "Chỉ bản nháp của bạn mới có thể nhận dữ liệu Excel.", correlationId);
  if (message.includes("ANNUAL_PLAN_LOCK_CONFLICT")) return errorResponse(409, "ANNUAL_PLAN_LOCK_CONFLICT", "Bản nháp đã thay đổi. Hãy tải lại trước khi áp dụng Excel.", correlationId);
  if (message.includes("EXCEL_REPLACE_CONFIRMATION_REQUIRED")) return errorResponse(422, "EXCEL_REPLACE_CONFIRMATION_REQUIRED", "Bạn phải xác nhận thay thế cả dữ liệu SKU và đợt mua.", correlationId);
  if (message.includes("EXCEL_CHECKSUM_MISMATCH")) return errorResponse(409, "EXCEL_CHECKSUM_MISMATCH", "Checksum file không khớp với bản xem trước.", correlationId);
  if (message.includes("EXCEL_PREVIEW_HAS_ERRORS")) return errorResponse(422, "EXCEL_PREVIEW_HAS_ERRORS", "File còn lỗi bắt buộc, chưa thể áp dụng.", correlationId);
  if (message.includes("EXCEL_IMPORT_ALREADY_APPLIED")) return errorResponse(409, "EXCEL_IMPORT_ALREADY_APPLIED", "File này đã được áp dụng trước đó.", correlationId);
  if (message.includes("idempotency_key_reused")) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "Khóa chống gửi trùng đã được dùng cho dữ liệu khác.", correlationId);
  return errorResponse(500, "EXCEL_APPLY_FAILED", "Không thể áp dụng file Excel. Vui lòng thử lại.", correlationId);
}

export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!uuidSchema.safeParse(revisionId).success) return errorResponse(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse(400, "INVALID_JSON", "Nội dung yêu cầu không hợp lệ.", correlationId); }
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) return errorResponse(422, "VALIDATION_ERROR", "Thông tin áp dụng Excel chưa hợp lệ.", correlationId);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const payload = { ...(parsed.data.payload ?? {}), replaceSections: parsed.data.replaceSections };
  const { data, error } = await supabase.rpc("apply_annual_plan_excel_v2", {
    p_revision_id: revisionId,
    p_expected_lock_version: parsed.data.lockVersion,
    p_import_session_id: parsed.data.importSessionId,
    p_checksum: parsed.data.checksum,
    p_payload: payload,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return mapApplyError(error.message ?? "EXCEL_APPLY_FAILED", correlationId);
  return NextResponse.json({ ok: true, data, correlationId }, { status: 200 });
}
