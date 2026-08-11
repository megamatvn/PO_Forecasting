import { describe, expect, it } from "vitest";
import { envSchema } from "@/lib/validation/env";

describe("envSchema", () => {
  it("rejects a missing Supabase publishable key", () => {
    const result = envSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });

    expect(result.success).toBe(false);
  });
});
