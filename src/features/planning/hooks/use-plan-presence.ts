"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface UsePlanPresenceInput {
  planVersionId: string;
  displayName?: string;
}
export function usePlanPresence({
  planVersionId,
  displayName,
}: UsePlanPresenceInput) {
  const [viewerCount, setViewerCount] = useState(displayName ? 1 : 0);

  useEffect(() => {
    if (!displayName) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(`planning-presence:${planVersionId}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const count = Object.values(channel.presenceState()).reduce(
          (total, presences) => total + presences.length,
          0,
        );
        setViewerCount(Math.max(1, count));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ displayName, onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [displayName, planVersionId]);

  return viewerCount;
}
