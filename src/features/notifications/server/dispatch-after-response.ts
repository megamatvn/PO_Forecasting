import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Best-effort dispatcher hook for a worker/cron; business commands already committed the outbox row. */
export async function dispatchNotification(outboxId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.rpc("dispatch_notification_outbox_v2", { p_outbox_id: outboxId });
}
