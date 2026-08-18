import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";
import { correlationId, isUuid, proposalFailure, proposalRpcError, proposalSuccess } from "../../_helpers";

const schema = z.object({ idempotencyKey: z.string().uuid() });
export async function POST(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const id = correlationId(); const { proposalId } = await context.params; const parsed = schema.safeParse(await parseJson<unknown>(request));
  if (!isUuid(proposalId) || !parsed.success) return proposalFailure(422, "VALIDATION_ERROR", "Yêu cầu rút đề xuất chưa hợp lệ.", id);
  const supabase = await createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return proposalFailure(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", id);
  const { data, error } = await supabase.rpc("withdraw_proposal_v2", { p_proposal_id: proposalId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) { const [status, code, message] = proposalRpcError(error); return proposalFailure(status, code, message, id); }
  return proposalSuccess(data, id);
}
