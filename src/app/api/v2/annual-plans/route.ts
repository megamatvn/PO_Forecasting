import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MAX_ANNUAL_PLAN_YEAR } from "@/features/annual-plans/contracts";

const createAnnualPlanSchema = z.object({
  brandId: z.string().uuid(),
  planningYear: z.number().int(),
  idempotencyKey: z.string().uuid(),
});

function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) {
  return apiError(status, code, message, correlationId, status >= 500, fieldErrors);
}

function mapRpcError(error: { code?: string | null; message?: string | null } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (message.includes("PAST_PLANNING_YEAR")) return [422, "PAST_PLANNING_YEAR", "Năm kế hoạch không được ở trong quá khứ."];
  if (message.includes("BRAND_ACCESS_REQUIRED") || error?.code === "42501") return [403, "BRAND_ACCESS_REQUIRED", "Bạn không có quyền lập kế hoạch cho nhãn hàng này."];
  if (message.includes("duplicate") || message.includes("unique constraint") || message.includes("active workflow")) {
    return [409, "ANNUAL_PLAN_CONFLICT", "Chu kỳ đang được chuẩn bị bởi một người dùng khác."];
  }
  return [422, "ANNUAL_PLAN_CREATE_FAILED", "Không thể tạo hoặc tiếp tục bản nháp kế hoạch."];
}

export async function POST(request: Request) {
  const correlationId = randomUUID();
  const parsed = createAnnualPlanSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) {
    return fail(422, "VALIDATION_ERROR", "Thông tin kế hoạch chưa hợp lệ.", correlationId, {
      form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."],
    });
  }
  if (parsed.data.planningYear < new Date().getFullYear()) {
    return fail(422, "PAST_PLANNING_YEAR", "Năm kế hoạch không được ở trong quá khứ.", correlationId, {
      planningYear: ["Chỉ được chọn năm hiện tại hoặc năm tương lai."],
    });
  }
  if (parsed.data.planningYear > MAX_ANNUAL_PLAN_YEAR) {
    return fail(422, "PLANNING_YEAR_OUT_OF_RANGE", `Năm kế hoạch không được sau ${MAX_ANNUAL_PLAN_YEAR}.`, correlationId, {
      planningYear: [`Chỉ được chọn đến năm ${MAX_ANNUAL_PLAN_YEAR}.`],
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);

  const { data, error } = await supabase.rpc("create_or_resume_annual_plan_v2", {
    p_brand_id: parsed.data.brandId,
    p_planning_year: parsed.data.planningYear,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const [status, code, message] = mapRpcError(error);
    return fail(status, code, message, correlationId);
  }
  return NextResponse.json({ ok: true, data, correlationId }, { status: 201 });
}
