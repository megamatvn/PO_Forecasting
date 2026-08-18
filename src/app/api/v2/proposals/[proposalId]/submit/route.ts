import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { proposalSubmitSchema } from "@/features/proposals/contracts";
import { correlationId, isUuid, proposalFailure, proposalRpcError, proposalSuccess } from "../../_helpers";

export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const id = correlationId(); const { proposalId } = await context.params;
  if (!isUuid(proposalId)) return proposalFailure(422, "VALIDATION_ERROR", "Mã đề xuất không hợp lệ.", id);
  const parsed = proposalSubmitSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return proposalFailure(422, "VALIDATION_ERROR", "Không thể gửi đề xuất khi dữ liệu chưa đủ.", id);
  const supabase = await createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return proposalFailure(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", id);
  const { data, error } = await supabase.rpc("submit_proposal_v2", { p_proposal_id: proposalId, p_expected_lock_version: parsed.data.lockVersion, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) { const [status, code, message] = proposalRpcError(error); return proposalFailure(status, code, message, id); }
  return proposalSuccess(data, id);
}
