import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const commitSchema = z.object({
  batchId: z.string().regex(UUID_PATTERN),
  idempotencyKey: z.string().regex(UUID_PATTERN),
  warningsConfirmed: z.boolean().default(false),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { code, message, correlationId: randomUUID() },
    { status },
  );
}

function mapCommitError(message: string) {
  if (message.includes("import_warnings_require_confirmation")) {
    return errorResponse(
      409,
      "warnings_require_confirmation",
      "Bạn cần xác nhận các cảnh báo trước khi hoàn tất import.",
    );
  }

  if (message.includes("import_batch_not_found")) {
    return errorResponse(404, "batch_not_found", "Không tìm thấy đợt import.");
  }

  if (message.includes("import_batch_forbidden")) {
    return errorResponse(
      403,
      "forbidden",
      "Bạn không có quyền hoàn tất đợt import này.",
    );
  }

  if (message.includes("import_batch_already_committed")) {
    return errorResponse(
      409,
      "already_committed",
      "Đợt import đã được hoàn tất bằng một yêu cầu khác.",
    );
  }

  if (
    message.includes("import_batch_has_errors") ||
    message.includes("import_batch_not_validated") ||
    message.includes("import_batch_has_no_rows")
  ) {
    return errorResponse(
      422,
      "batch_not_committable",
      "Đợt import chưa đủ điều kiện để hoàn tất.",
    );
  }

  return errorResponse(
    500,
    "commit_failed",
    "Không thể hoàn tất import. Vui lòng thử lại.",
  );
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Nội dung yêu cầu không hợp lệ.");
  }

  const parsed = commitSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Thiếu mã đợt import hoặc khóa chống gửi trùng hợp lệ.",
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.");
  }

  const { data: snapshotId, error } = await supabase.rpc(
    "commit_import_batch",
    {
      p_batch_id: parsed.data.batchId,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_warnings_confirmed: parsed.data.warningsConfirmed,
    },
  );

  if (error || !snapshotId) {
    return mapCommitError(error?.message ?? "commit_failed");
  }

  return NextResponse.json({ snapshotId });
}
