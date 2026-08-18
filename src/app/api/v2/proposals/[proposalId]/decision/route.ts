import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { proposalDecisionSchema } from "@/features/proposals/contracts";
import { correlationId, isUuid, proposalFailure, proposalRpcError, proposalSuccess } from "../../_helpers";

export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const id = correlationId(); const { proposalId } = await context.params;
  if (!isUuid(proposalId)) return proposalFailure(422, "VALIDATION_ERROR", "Mã đề xuất không hợp lệ.", id);
  const parsed = proposalDecisionSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return proposalFailure(422, "VALIDATION_ERROR", "Quyết định đề xuất chưa hợp lệ.", id, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  if (parsed.data.decision === "request_changes" && parsed.data.comment.trim().length < 10) return proposalFailure(422, "PROPOSAL_COMMENT_REQUIRED", "Vui lòng nêu rõ nội dung cần chỉnh sửa.", id, { comment: ["Tối thiểu 10 ký tự."] });
  const supabase = await createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return proposalFailure(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", id);
  const { data, error } = await supabase.rpc("decide_proposal_v2", { p_proposal_id: proposalId, p_decision: parsed.data.decision, p_comment: parsed.data.comment, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) {
    const [status, code, message] = proposalRpcError(error); return proposalFailure(status, code, message, id);
  }
  return proposalSuccess(data, id);
}
