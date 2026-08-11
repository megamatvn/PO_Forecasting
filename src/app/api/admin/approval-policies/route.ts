import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const policySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    mode: z.enum(["fixed_two_level", "threshold"]),
    thresholdAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/).nullable(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    brandIds: z.array(z.string().regex(UUID_PATTERN)).min(1),
    escalationFlags: z
      .array(z.enum(["criticalShortage", "budgetOverrun", "newSupplier"]))
      .default([]),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullable(),
  })
  .superRefine((value, context) => {
    if (value.mode === "threshold" && value.thresholdAmount === null) {
      context.addIssue({
        code: "custom",
        path: ["thresholdAmount"],
        message: "Cần nhập hạn mức cho chính sách theo hạn mức.",
      });
    }
    if (value.mode === "fixed_two_level" && value.thresholdAmount !== null) {
      context.addIssue({
        code: "custom",
        path: ["thresholdAmount"],
        message: "Chính sách hai cấp bắt buộc không dùng hạn mức.",
      });
    }
  });

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { code, message, correlationId: randomUUID() },
    { status },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Nội dung yêu cầu không hợp lệ.");
  }

  const parsed = policySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_policy",
      parsed.error.issues[0]?.message ?? "Chính sách duyệt không hợp lệ.",
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.");
  }

  const { data: policyId, error } = await supabase.rpc(
    "create_approval_policy",
    {
      p_name: parsed.data.name,
      p_mode: parsed.data.mode,
      p_threshold_amount: parsed.data.thresholdAmount,
      p_currency_code: parsed.data.currencyCode,
      p_brand_ids: parsed.data.brandIds,
      p_escalation_flags: parsed.data.escalationFlags,
      p_effective_from: parsed.data.effectiveFrom,
      p_effective_to: parsed.data.effectiveTo,
    },
  );

  if (!error && policyId) {
    return NextResponse.json({ policyId }, { status: 201 });
  }

  if (error?.message.includes("approval_policy_admin_required")) {
    return errorResponse(
      403,
      "forbidden",
      "Chỉ quản trị viên được cấu hình chính sách duyệt.",
    );
  }

  return errorResponse(
    422,
    "policy_save_failed",
    "Không thể lưu chính sách. Cấu hình hiện tại chưa bị thay đổi.",
  );
}
