import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_PATTERN);
const decimal = z.string().regex(/^\d+(?:\.\d{1,6})?$/);
const purchaseValues = {
  qty: z.number().int().nonnegative(),
  focQty: z.number().int().nonnegative(),
  exPrice: decimal,
};
const draftSchema = z.object({
  planVersionId: uuid,
  expectedLockVersion: z.number().int().nonnegative(),
  idempotencyKey: uuid,
  changes: z.object({
    purchaseLines: z
      .array(z.object({ id: uuid, ...purchaseValues }))
      .optional(),
    purchaseProposals: z
      .array(z.object({ productId: uuid, ...purchaseValues }))
      .optional(),
  }),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { code, message, correlationId: randomUUID() },
    { status },
  );
}

interface RouteContext {
  params: Promise<{ planVersionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { planVersionId } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Nội dung yêu cầu không hợp lệ.");
  }

  const parsed = draftSchema.safeParse(body);
  if (!parsed.success || parsed.data.planVersionId !== planVersionId) {
    return errorResponse(
      400,
      "invalid_request",
      "Dữ liệu lưu kế hoạch không hợp lệ.",
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.");
  }

  const { data: lockVersion, error } = await supabase.rpc(
    "save_planning_workspace",
    {
      p_plan_version_id: planVersionId,
      p_expected_lock_version: parsed.data.expectedLockVersion,
      p_changes: parsed.data.changes,
      p_idempotency_key: parsed.data.idempotencyKey,
    },
  );

  if (!error && typeof lockVersion === "number") {
    return NextResponse.json({ lockVersion });
  }

  if (error?.message.includes("PLAN_VERSION_CONFLICT")) {
    const { data: remoteVersion } = await supabase
      .from("plan_versions")
      .select("lock_version")
      .eq("id", planVersionId)
      .maybeSingle();

    return NextResponse.json(
      {
        code: "PLAN_VERSION_CONFLICT",
        message:
          "Kế hoạch đã được cập nhật bởi một người dùng khác. Hãy tải phiên bản mới để so sánh.",
        remoteLockVersion: remoteVersion?.lock_version ?? null,
        correlationId: randomUUID(),
      },
      { status: 409 },
    );
  }

  if (error?.message.includes("save_draft_forbidden")) {
    return errorResponse(
      403,
      "forbidden",
      "Bạn không có quyền chỉnh sửa kế hoạch này.",
    );
  }

  return errorResponse(
    422,
    "save_failed",
    "Không thể lưu thay đổi kế hoạch. Dữ liệu local vẫn được giữ lại.",
  );
}
