import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const revisionSchema = z.object({ idempotencyKey: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!z.string().uuid().safeParse(revisionId).success) return apiError(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);
  const parsed = revisionSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return apiError(422, "VALIDATION_ERROR", "Yêu cầu tạo phiên bản chưa hợp lệ.", correlationId, false, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  let cycleId = revisionId;
  if (typeof (supabase as { from?: unknown }).from === "function") {
    const { data: source } = await (supabase as unknown as { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: { cycle_id?: string } | null }> } } } }).from("annual_plan_revisions").select("cycle_id").eq("id", revisionId).maybeSingle();
    if (source?.cycle_id) cycleId = source.cycle_id;
  }
  const { data, error } = await supabase.rpc("create_annual_plan_revision_v2", { p_cycle_id: cycleId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("SOURCE_NOT_APPROVED")) return apiError(409, "ANNUAL_PLAN_SOURCE_NOT_APPROVED", "Chỉ có thể tạo phiên bản điều chỉnh từ kế hoạch đã được phê duyệt.", correlationId);
    if (message.includes("ACCESS") || error.code === "42501") return apiError(403, "ANNUAL_PLAN_REVISION_FORBIDDEN", "Bạn không có quyền tạo phiên bản điều chỉnh.", correlationId);
    return apiError(422, "ANNUAL_PLAN_REVISION_FAILED", "Không thể tạo phiên bản điều chỉnh.", correlationId);
  }
  return NextResponse.json({ ok: true, data, correlationId }, { status: 201 });
}
