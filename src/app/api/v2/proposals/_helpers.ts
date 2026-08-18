import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/contract";

export function correlationId(): string { return randomUUID(); }

export function proposalFailure(
  status: number,
  code: string,
  message: string,
  id: string,
  fieldErrors?: Record<string, string[]>,
) {
  return apiError(status, code, message, id, status >= 500, fieldErrors);
}

export function proposalSuccess(data: unknown, id: string, status = 200) {
  return NextResponse.json({ ok: true, data, correlationId: id }, { status });
}

export function proposalRpcError(error: { code?: string | null; message?: string | null } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (error?.code === "42501" || /FORBIDDEN|ACCESS_REQUIRED|ASSIGNEE/i.test(message)) return [403, "PROPOSAL_FORBIDDEN", "Bạn không có quyền thực hiện thao tác này."];
  if (/LOCK_CONFLICT/i.test(message)) return [409, "PROPOSAL_LOCK_CONFLICT", "Bản đề xuất vừa được cập nhật. Hãy tải lại trước khi tiếp tục."];
  if (/IDEMPOTENCY_KEY_REUSED/i.test(message)) return [409, "IDEMPOTENCY_KEY_REUSED", "Yêu cầu này đã được dùng cho một thao tác khác."];
  if (/WAVE_REQUIRED/i.test(message)) return [422, "PROPOSAL_WAVE_REQUIRED", "Bạn phải chọn PO ghi nhận trước khi phê duyệt."];
  if (/CANCELLATION_DECISION_FORBIDDEN/i.test(message)) return [403, "CANCELLATION_FORBIDDEN", "Bạn không phải người được phân công quyết định hủy đề xuất này."];
  if (/CANCELLATION_PROPOSAL_NOT_FOUND/i.test(message)) return [404, "PROPOSAL_NOT_FOUND", "Không tìm thấy đề xuất cần xử lý."];
  if (/CANCELLATION_COMMENT_REQUIRED/i.test(message)) return [422, "PROPOSAL_COMMENT_REQUIRED", "Vui lòng nhập lý do đủ rõ ràng khi không chấp thuận hủy."];
  if (/CANCELLATION_DECISION_INVALID/i.test(message)) return [422, "VALIDATION_ERROR", "Quyết định hủy đề xuất chưa hợp lệ."];
  if (/OVERLAP|DUPLICATE|CONFLICT/i.test(message)) return [409, "PROPOSAL_CONFLICT", "Đề xuất đang xung đột với một thay đổi khác."];
  if (/BASELINE_NOT_APPROVED|NO_ACTIVE_WAVE/i.test(message)) return [422, "PROPOSAL_BASELINE_UNAVAILABLE", "Nhãn hàng chưa có kế hoạch được duyệt và đợt mua đang hoạt động."];
  if (/COMMENT_REQUIRED/i.test(message)) return [422, "PROPOSAL_COMMENT_REQUIRED", "Vui lòng nhập lý do hoặc góp ý đủ rõ ràng."];
  if (/INPUT_INVALID|LINES_INVALID|LINES_REQUIRED|PRODUCT_FORBIDDEN/i.test(message)) return [422, "PROPOSAL_VALIDATION_ERROR", "Thông tin đề xuất chưa hợp lệ."];
  return [422, "PROPOSAL_OPERATION_FAILED", "Không thể hoàn tất thao tác đề xuất."];
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
