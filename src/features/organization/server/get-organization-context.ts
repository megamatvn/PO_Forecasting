import "server-only";

import { cache } from "react";
import {
  currentAccessV2Schema,
  type CurrentAccessV2,
} from "@/features/auth/access-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const getOrganizationContext = cache(
  async (): Promise<CurrentAccessV2 | null> => {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase.rpc("get_current_access_v2");

    if (error || !data) {
      return null;
    }

    return currentAccessV2Schema.parse(data);
  },
);
