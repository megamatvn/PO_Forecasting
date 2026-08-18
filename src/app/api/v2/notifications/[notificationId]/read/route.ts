import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notificationReadSchema } from "@/features/notifications/contracts";
import { apiError } from "@/lib/api/contract";

export async function POST(request: Request, context: { params: Promise<{ notificationId: string }> }) {
  const correlationId = randomUUID(); const { notificationId } = await context.params; const parsed = notificationReadSchema.safeParse({ notificationId: (await parseJson<unknown>(request) as { notificationId?: string } | null)?.notificationId ?? notificationId });
  if (!parsed.success || parsed.data.notificationId !== notificationId) return apiError(422, "VALIDATION_ERROR", "Thông báo không hợp lệ.", correlationId);
  const supabase = await createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return apiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const { data, error } = await supabase.rpc("mark_notification_read_v2", { p_notification_id: notificationId });
  if (error) return apiError(422, "NOTIFICATION_READ_FAILED", "Không thể đánh dấu thông báo đã đọc.", correlationId);
  return NextResponse.json({ ok: true, data: { updated: data === true }, correlationId });
}
