import "server-only";

import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { NotificationDTO } from "../contracts";

export async function loadNotifications(limit = 30): Promise<{ notifications: NotificationDTO[]; unreadCount: number }> {
  const access = await getOrganizationContext();
  if (!access) return { notifications: [], unreadCount: 0 };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("notifications").select("id,kind,title,body,href,read_at,created_at").order("created_at", { ascending: false }).limit(limit);
  if (error || !Array.isArray(data)) return { notifications: [], unreadCount: 0 };
  const notifications = (data as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), kind: String(row.kind), title: String(row.title), body: String(row.body), href: row.href == null ? null : String(row.href), readAt: row.read_at == null ? null : String(row.read_at), createdAt: String(row.created_at) }));
  return { notifications, unreadCount: notifications.filter((item) => !item.readAt).length };
}
