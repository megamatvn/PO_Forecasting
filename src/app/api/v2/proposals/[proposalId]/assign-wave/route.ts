import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { proposalWaveAssignmentSchema } from "@/features/proposals/contracts";
import { correlationId, isUuid, proposalFailure, proposalRpcError, proposalSuccess } from "../../_helpers";

export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const id = correlationId(); const { proposalId } = await context.params;
  if (!isUuid(proposalId)) return proposalFailure(422, "VALIDATION_ERROR", "Mã đề xuất không hợp lệ.", id);
  const parsed = proposalWaveAssignmentSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return proposalFailure(422, "VALIDATION_ERROR", "Vui lòng chọn một PO hợp lệ.", id);
  const supabase = await createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return proposalFailure(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", id);
  const { data, error } = await supabase.rpc("assign_proposal_wave_v2", { p_proposal_id: proposalId, p_expected_lock_version: parsed.data.lockVersion, p_wave_id: parsed.data.waveId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) { const [status, code, message] = proposalRpcError(error); return proposalFailure(status, code, message, id); }
  return proposalSuccess(data, id);
}
