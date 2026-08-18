import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { capabilities, orgTiers, postgresUuid } from "@/features/organization/contracts";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuid = postgresUuid;
const schema = z.object({ userId: uuid, tier: z.enum(orgTiers), isActive: z.boolean(), supervisorId: uuid.nullable(), capabilities: z.array(z.enum(capabilities)).default([]), brandIds: z.array(uuid).default([]), replacementUserId: uuid.optional(), idempotencyKey: uuid }).superRefine((value, context) => { if (value.isActive && (value.tier === "leader" || value.tier === "manager") && !value.supervisorId) context.addIssue({ code: "custom", path: ["supervisorId"], message: "Bắt buộc chọn người quản lý trực tiếp." }); if (!value.isActive && value.replacementUserId && !value.userId) context.addIssue({ code: "custom", path: ["replacementUserId"], message: "Người thay thế không hợp lệ." }); });

function success<T>(data: T, correlationId: string, status = 200) { return NextResponse.json({ ok: true, data, correlationId }, { status }); }
function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) { return apiError(status, code, message, correlationId, status >= 500, fieldErrors); }
function rowToDto(row: Record<string, unknown>) {
  const direct = Array.isArray(row.directBrands ?? row.direct_brands) ? row.directBrands ?? row.direct_brands : [];
  const inherited: unknown[] = Array.isArray(row.inheritedBrands ?? row.inherited_brands) ? (row.inheritedBrands ?? row.inherited_brands) as unknown[] : [];
  return { id: String(row.id ?? row.user_id), displayName: String(row.displayName ?? row.display_name ?? ""), isActive: Boolean(row.isActive ?? row.is_active), tier: row.tier, supervisorId: (row.supervisorId ?? row.supervisor_id ?? null) as string | null, capabilities: (row.capabilities ?? []) as string[], directBrands: direct, inheritedBrands: inherited.map((item) => { const value = item as Record<string, unknown>; return { ...value, sourceUserName: String(value.sourceUserName ?? value.source_user_name ?? value.sourceUserId ?? value.source_user_id ?? "Không rõ") }; }), subordinateCount: Number(row.subordinateCount ?? row.subordinate_count ?? 0) };
}
function isConflict(message: string) { return ["idempotency_key_reused", "REPORTING_CYCLE", "SUPERVISOR_", "ACTIVE_SUPERVISORS", "ACTIVE_SUBORDINATES", "CANNOT_DEACTIVATE", "CANNOT_CHANGE_OWN", "LAST_ACTIVE_ADMINISTRATOR", "REPLACEMENT_", "NO_DIRECT_REPORTS_TO_REPLACE"].some((token) => message.includes(token)); }
async function isAdministrator(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) { const result = await supabase.rpc("current_user_has_capability", { p_capability: "administer_system" }); return result.data === true && !result.error; }

export async function POST(request: Request) {
  const correlationId = randomUUID(); const body = await parseJson<unknown>(request); const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thông tin phân quyền chưa hợp lệ.", correlationId, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  const supabase = await createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  if (!(await isAdministrator(supabase))) return fail(403, "FORBIDDEN", "Chỉ Administrator được quản trị tổ chức.", correlationId);
  const { error } = parsed.data.replacementUserId && !parsed.data.isActive
    ? await supabase.rpc("replace_user_supervisor_v2", { p_target_user_id: parsed.data.userId, p_replacement_user_id: parsed.data.replacementUserId, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey })
    : await supabase.rpc("set_user_organization_v2", { p_user_id: parsed.data.userId, p_tier: parsed.data.tier, p_is_active: parsed.data.isActive, p_supervisor_id: parsed.data.supervisorId, p_capabilities: parsed.data.capabilities, p_brand_ids: parsed.data.brandIds, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey });
  if (error) { const message = error.message ?? ""; return fail(isConflict(message) ? 409 : 422, isConflict(message) ? "ORGANIZATION_CONFLICT" : "ORGANIZATION_SAVE_FAILED", isConflict(message) ? "Thay đổi này xung đột với quan hệ tổ chức hiện tại." : "Không thể lưu quyền tổ chức.", correlationId); }
  const { data: rows, error: listError } = await supabase.rpc("list_manageable_users_v2");
  const canonical = Array.isArray(rows) ? rows.map((row) => rowToDto(row as Record<string, unknown>)).find((row) => row.id === parsed.data.userId) : null;
  if (canonical) return success(canonical, correlationId);
  return fail(listError ? 422 : 500, "ORGANIZATION_CANONICAL_READ_FAILED", "Đã lưu nhưng chưa đọc được quyền hiệu lực mới. Hãy tải lại trước khi thử lại.", correlationId, undefined);
}
