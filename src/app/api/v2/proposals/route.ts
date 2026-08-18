import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { proposalDraftSchema } from "@/features/proposals/contracts";
import { correlationId, proposalFailure, proposalRpcError, proposalSuccess } from "./_helpers";

export async function POST(request: Request) {
  const id = correlationId();
  const parsed = proposalDraftSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return proposalFailure(422, "VALIDATION_ERROR", "Thông tin đề xuất chưa hợp lệ.", id, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return proposalFailure(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", id);
  const { data, error } = await supabase.rpc("create_or_resume_proposal_v2", {
    p_brand_id: parsed.data.brandId,
    p_planning_year: parsed.data.planningYear,
    p_needed_month: `${parsed.data.neededMonth}-01`,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) { const [status, code, message] = proposalRpcError(error); return proposalFailure(status, code, message, id); }
  return proposalSuccess(data, id, 201);
}
