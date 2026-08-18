import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const policySchema = z.object({
  name: z.string().trim().min(1).max(160),
  mode: z.enum(["fixed_two_level", "threshold"]),
  thresholdAmount: z.string().regex(/^\d+(?:\.\d{1,6})?$/).nullable(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  brandIds: z.array(z.string().uuid()).min(1),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable(),
  idempotencyKey: z.string().uuid(),
}).superRefine((value, ctx) => {
  if (value.mode === "threshold" && value.thresholdAmount === null) ctx.addIssue({ code: "custom", path: ["thresholdAmount"], message: "Cần nhập hạn mức cho chính sách theo hạn mức." });
  if (value.mode === "fixed_two_level" && value.thresholdAmount !== null) ctx.addIssue({ code: "custom", path: ["thresholdAmount"], message: "Chính sách hai cấp bắt buộc không dùng hạn mức." });
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "Ngày kết thúc phải sau ngày bắt đầu." });
});

function errorResponse(status: number, code: string, message: string, correlationId: string) {
  return NextResponse.json({ ok: false, error: { code, message, retryable: false, correlationId } }, { status });
}

export async function POST(request: Request) {
  const correlationId = randomUUID();
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse(400, "INVALID_JSON", "Nội dung yêu cầu không hợp lệ.", correlationId); }
  const parsed = policySchema.safeParse(body);
  if (!parsed.success) return errorResponse(422, "PROPOSAL_POLICY_INVALID", parsed.error.issues[0]?.message ?? "Chính sách đề xuất không hợp lệ.", correlationId);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const { data, error } = await supabase.rpc("create_proposal_approval_policy_v2", {
    p_name: parsed.data.name,
    p_mode: parsed.data.mode,
    p_threshold_amount: parsed.data.thresholdAmount,
    p_currency_code: parsed.data.currencyCode,
    p_brand_ids: parsed.data.brandIds,
    p_effective_from: parsed.data.effectiveFrom,
    p_effective_to: parsed.data.effectiveTo,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    if (error.message.includes("PROPOSAL_POLICY_ADMIN_REQUIRED") || error.code === "42501") return errorResponse(403, "PROPOSAL_POLICY_FORBIDDEN", "Chỉ quản trị viên được cấu hình chính sách đề xuất.", correlationId);
    if (error.message.includes("PROPOSAL_POLICY_OVERLAP")) return errorResponse(409, "PROPOSAL_POLICY_OVERLAP", "Khoảng hiệu lực đang trùng với một chính sách khác của nhãn hàng.", correlationId);
    return errorResponse(422, "PROPOSAL_POLICY_SAVE_FAILED", "Không thể lưu chính sách đề xuất.", correlationId);
  }
  return NextResponse.json({ ok: true, data, correlationId }, { status: 201 });
}
