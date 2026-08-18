import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { proposalSaveSchema } from "@/features/proposals/contracts";
import { correlationId, isUuid, proposalFailure, proposalRpcError, proposalSuccess } from "../_helpers";

export async function PATCH(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const id = correlationId();
  const { proposalId } = await context.params;
  if (!isUuid(proposalId)) return proposalFailure(422, "VALIDATION_ERROR", "Mã đề xuất không hợp lệ.", id);
  const parsed = proposalSaveSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return proposalFailure(422, "VALIDATION_ERROR", "Dòng hàng đề xuất chưa hợp lệ.", id, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return proposalFailure(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", id);
  const { data, error } = await supabase.rpc("save_proposal_v2", {
    p_proposal_id: proposalId,
    p_expected_lock_version: parsed.data.lockVersion,
    p_lines: parsed.data.lines.map((line) => ({ productId: line.productId, requestedQty: line.requestedQty })),
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) { const [status, code, message] = proposalRpcError(error); return proposalFailure(status, code, message, id); }
  return proposalSuccess(data, id);
}
