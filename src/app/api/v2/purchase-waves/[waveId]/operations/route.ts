import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { apiError } from "@/lib/api/contract";
import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const schema = z.object({
  operation: z.enum(["ordered", "supplier_confirmed", "received", "cancelled"]),
  officialPoNumber: z.string().trim().max(80).optional().nullable(),
  orderedAt: z.string().date().optional().nullable(),
  supplierConfirmedAt: z.string().date().optional().nullable(),
  receivedAt: z.string().date().optional().nullable(),
  reassignments: z.array(z.object({ proposalId: z.string().uuid(), replacementWaveId: z.string().uuid() })).default([]),
  idempotencyKey: z.string().uuid(),
});

function failure(status: number, code: string, message: string, correlationId: string) {
  return apiError(status, code, message, correlationId, status >= 500);
}

function rpcFailure(error: { code?: string | null; message?: string | null } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (error?.code === "42501" || /FORBIDDEN/i.test(message)) return [403, "PURCHASE_WAVE_OPERATION_FORBIDDEN", "Bạn không có quyền cập nhật đợt mua này."];
  if (/ACTIVE_PROPOSAL_REASSIGNMENT_REQUIRED/i.test(message)) return [409, "ACTIVE_PROPOSAL_REASSIGNMENT_REQUIRED", "Đợt mua đang có đề xuất hoạt động. Hãy chuyển tất cả đề xuất sang PO khác trong cùng thao tác."];
  if (/REPLACEMENT_INVALID/i.test(message)) return [422, "PURCHASE_WAVE_REPLACEMENT_INVALID", "PO thay thế không hợp lệ hoặc không thuộc cùng kế hoạch."];
  if (/IDEMPOTENCY_KEY_REUSED/i.test(message)) return [409, "IDEMPOTENCY_KEY_REUSED", "Khóa thao tác đã được dùng cho yêu cầu khác."];
  if (/DATA_REQUIRED|OPERATION_INVALID|CANCELLATION_INVALID/i.test(message)) return [422, "PURCHASE_WAVE_OPERATION_INVALID", "Thông tin hoặc trạng thái chuyển tiếp của đợt mua chưa hợp lệ."];
  return [422, "PURCHASE_WAVE_OPERATION_FAILED", "Không thể cập nhật đợt mua."];
}

export async function POST(request: Request, context: { params: Promise<{ waveId: string }> }) {
  const correlationId = randomUUID();
  const { waveId } = await context.params;
  if (!UUID.test(waveId)) return failure(422, "VALIDATION_ERROR", "Mã đợt mua không hợp lệ.", correlationId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(422, "VALIDATION_ERROR", "Thông tin cập nhật đợt mua chưa hợp lệ.", correlationId);
  const access = await getOrganizationContext();
  if (!access) return failure(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("operate_purchase_wave_v2", {
    p_wave_id: waveId,
    p_next_status: parsed.data.operation,
    p_official_po_number: parsed.data.officialPoNumber ?? null,
    p_ordered_at: parsed.data.orderedAt ?? null,
    p_supplier_confirmed_at: parsed.data.supplierConfirmedAt ?? null,
    p_received_at: parsed.data.receivedAt ?? null,
    p_reassignments: parsed.data.reassignments,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const [status, code, message] = rpcFailure(error);
    return failure(status, code, message, correlationId);
  }
  return Response.json({ ok: true, data, correlationId });
}
