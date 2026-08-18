import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { capabilities, orgTiers, postgresUuid } from "@/features/organization/contracts";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationUserDTO } from "@/features/organization/components/organization-access-manager";

const uuid = postgresUuid;
const accountSchema = z.object({ emailPrefix: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/), displayName: z.string().trim().min(1).max(160), password: z.string().min(8).max(128), tier: z.enum(orgTiers), supervisorId: uuid.nullable(), capabilities: z.array(z.enum(capabilities)).default([]), brandIds: z.array(uuid).default([]), idempotencyKey: uuid }).superRefine((value, context) => { if ((value.tier === "leader" || value.tier === "manager") && !value.supervisorId) context.addIssue({ code: "custom", path: ["supervisorId"], message: "Bắt buộc chọn người quản lý trực tiếp." }); });
type Client = Awaited<ReturnType<typeof createServerSupabaseClient>>;
function emailFor(prefix: string) { return `${prefix.trim().toLowerCase()}@sagen-groupe.com`; }
function dto(row: Record<string, unknown>): OrganizationUserDTO { const direct = (row.directBrands ?? row.direct_brands ?? []) as OrganizationUserDTO["directBrands"]; const inherited = (row.inheritedBrands ?? row.inherited_brands ?? []) as Array<Record<string, unknown>>; return { id: String(row.id ?? row.user_id), displayName: String(row.displayName ?? row.display_name ?? ""), isActive: Boolean(row.isActive ?? row.is_active), tier: row.tier as OrganizationUserDTO["tier"], supervisorId: (row.supervisorId ?? row.supervisor_id ?? null) as string | null, capabilities: (row.capabilities ?? []) as OrganizationUserDTO["capabilities"], directBrands: direct, inheritedBrands: inherited.map((item) => ({ id: String(item.id), code: String(item.code), name: String(item.name), sourceUserName: String(item.sourceUserName ?? item.source_user_name ?? item.sourceUserId ?? item.source_user_id ?? "Không rõ") })), subordinateCount: Number(row.subordinateCount ?? row.subordinate_count ?? 0) }; }
function fail(status: number, code: string, message: string, correlationId: string) { return apiError(status, code, message, correlationId, status >= 500); }
async function authAdmin(supabase: Client) { const { data: { user } } = await supabase.auth.getUser(); if (!user) return { status: 401 as const, user: null }; const check = await supabase.rpc("current_user_has_capability", { p_capability: "administer_system" }); if (check.error || check.data !== true) return { status: 403 as const, user: null }; return { status: 200 as const, user }; }

export async function GET() { const correlationId = randomUUID(); const supabase = await createServerSupabaseClient(); const auth = await authAdmin(supabase); if (!auth.user) return fail(auth.status, auth.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", auth.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Chỉ Administrator được quản trị tổ chức.", correlationId); const { data, error } = await supabase.rpc("list_manageable_users_v2"); if (error) return fail(422, "ORGANIZATION_LIST_FAILED", "Không thể tải danh sách tài khoản.", correlationId); return NextResponse.json({ ok: true, data: (data as unknown[] ?? []).map((row: unknown) => dto(row as Record<string, unknown>)), correlationId }, { status: 200 }); }

export async function POST(request: Request) {
  const correlationId = randomUUID(); const parsed = accountSchema.safeParse(await parseJson<unknown>(request)); if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Thông tin tài khoản chưa hợp lệ.", correlationId);
  const supabase = await createServerSupabaseClient(); const auth = await authAdmin(supabase); if (!auth.user) return fail(auth.status, auth.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", auth.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Chỉ Administrator được tạo tài khoản.", correlationId);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !serviceKey) return fail(503, "SERVER_CONFIGURATION_ERROR", "Máy chủ chưa được cấu hình để tạo tài khoản.", correlationId);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }); const email = emailFor(parsed.data.emailPrefix); const created = await admin.auth.admin.createUser({ email, password: parsed.data.password, email_confirm: true, user_metadata: { display_name: parsed.data.displayName } });
  if (created.error || !created.data.user) { const duplicate = created.error?.message.toLowerCase().includes("already") || created.error?.status === 422; return fail(duplicate ? 409 : 422, duplicate ? "EMAIL_ALREADY_REGISTERED" : "AUTH_ACCOUNT_CREATE_FAILED", duplicate ? "Email này đã tồn tại." : "Không thể tạo tài khoản đăng nhập.", correlationId); }
  const authUserId = created.data.user.id; let profileCreated = false;
  try {
    // Auth onboarding normally creates the profile via trigger. Upsert keeps
    // this route safe when the trigger has already won the race, while also
    // supporting projects where onboarding is disabled.
    // Profile creation is an administrative onboarding operation. The
    // authenticated client is intentionally restricted to self-service
    // profile updates, so use the service-role client that already owns the
    // Auth admin operation for the trigger-race-safe upsert.
    const profile = await admin.from("profiles").upsert({ id: authUserId, display_name: parsed.data.displayName, is_active: true }, { onConflict: "id" }); if (profile.error) throw new Error("PROFILE_CREATE_FAILED"); profileCreated = true;
    const organization = await supabase.rpc("set_user_organization_v2", { p_user_id: authUserId, p_tier: parsed.data.tier, p_is_active: true, p_supervisor_id: parsed.data.supervisorId, p_capabilities: parsed.data.capabilities, p_brand_ids: parsed.data.brandIds, p_correlation_id: correlationId, p_idempotency_key: parsed.data.idempotencyKey }); if (organization.error) throw organization.error;
    const listed = await supabase.rpc("list_manageable_users_v2"); const canonical = Array.isArray(listed.data) ? (listed.data as unknown[]).map((row: unknown) => dto(row as Record<string, unknown>)).find((row) => row.id === authUserId) : null; if (!canonical) throw new Error("ORGANIZATION_CANONICAL_READ_FAILED"); return NextResponse.json({ ok: true, data: canonical, correlationId }, { status: 201 });
  } catch (error) { await admin.auth.admin.deleteUser(authUserId); if (profileCreated) { /* profile is removed by the Auth cascade in the database */ } const message = error instanceof Error ? error.message : ""; const conflict = message.includes("SUPERVISOR") || message.includes("CYCLE") || message.includes("idempotency"); return fail(conflict ? 409 : 422, conflict ? "ORGANIZATION_CONFLICT" : "ACCOUNT_ORGANIZATION_FAILED", conflict ? "Không thể tạo tài khoản vì quan hệ tổ chức bị xung đột." : "Không thể hoàn tất cấu hình tài khoản.", correlationId); }
}
