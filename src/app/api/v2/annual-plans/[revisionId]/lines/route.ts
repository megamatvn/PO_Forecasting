import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { annualLineInputSchema } from "@/features/annual-plans/contracts";
import { calculateAnnualLine } from "@/features/annual-plans/domain/calculations";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const saveAnnualLinesSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
  lines: z.array(annualLineInputSchema.extend({ clientRowId: z.string().trim().min(1).optional() })).min(1),
  idempotencyKey: z.string().uuid(),
});

function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) {
  return apiError(status, code, message, correlationId, status >= 500, fieldErrors);
}

function mapError(error: { code?: string | null; message?: string | null } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (message.includes("LOCK_CONFLICT")) return [409, "ANNUAL_PLAN_LOCK_CONFLICT", "Bản kế hoạch đã thay đổi. Hãy tải lại trước khi lưu tiếp."];
  if (message.includes("DRAFT_FORBIDDEN") || message.includes("PRODUCT_FORBIDDEN") || error?.code === "42501") return [403, "ANNUAL_PLAN_DRAFT_FORBIDDEN", "Bạn không có quyền chỉnh sửa SKU trong bản nháp này."];
  if (message.includes("duplicate") || message.includes("unique constraint")) return [409, "ANNUAL_PLAN_LINE_CONFLICT", "SKU bị lặp trong kế hoạch."];
  return [422, "ANNUAL_PLAN_LINES_SAVE_FAILED", "Không thể lưu danh sách SKU."];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ revisionId: string }> },
) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!z.string().uuid().safeParse(revisionId).success) return fail(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);
  const parsed = saveAnnualLinesSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Danh sách SKU chưa hợp lệ.", correlationId, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);

  const lines = parsed.data.lines.map((line) => {
    const calculated = calculateAnnualLine(line);
    return {
      ...line,
      annualPaidQty: line.paidQty,
      annualFocQty: line.expectedFoc,
      amount: calculated.plannedAmount,
      totalReceipts: calculated.totalReceipts,
    };
  });
  const { data, error } = await supabase.rpc("save_annual_plan_lines_v2", {
    p_revision_id: revisionId,
    p_expected_lock_version: parsed.data.lockVersion,
    p_lines: lines,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const [status, code, message] = mapError(error);
    return fail(status, code, message, correlationId);
  }
  const result = (data ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    data: {
      revisionId,
      lockVersion: Number(result.lockVersion ?? parsed.data.lockVersion + 1),
      lines,
    },
    correlationId,
  }, { status: 200 });
}
