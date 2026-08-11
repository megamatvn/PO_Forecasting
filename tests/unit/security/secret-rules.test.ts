import { describe, expect, it } from "vitest";
import { findSecret } from "../../../scripts/secret-rules.mjs";

const postgresScheme = "postgres" + "ql://";
const jwtPrefix = "ey" + "J";

describe("secret scanner rules", () => {
  it.each([
    ["database password", "SUPABASE_DB_" + "PASSWORD=RealPassword123!"],
    ["pooler URL", "SUPABASE_DB_POOLER_URL=" + postgresScheme + "user:pass@db.example.test:6543/postgres"],
    ["database URL", "DATABASE_URL=" + postgresScheme + "user:pass@db.example.test:5432/postgres"],
    ["alternate service secret", "INTERNAL_SERVICE_ROLE_TOKEN=" + jwtPrefix + "a".repeat(32)],
    ["new Supabase secret key", "SUPABASE_SERVICE_ROLE_KEY=sb_" + "secret_" + "a".repeat(32)],
    ["bare Supabase secret key", "sb_" + "secret_" + "a".repeat(32)],
    ["JSON Supabase secret key", JSON.stringify({ key: "sb_" + "secret_" + "a".repeat(32) })],
  ])("detects %s", (_label, source) => {
    expect(findSecret(source)).not.toBeNull();
  });

  it.each([
    "SUPABASE_DB_" + "PASSWORD=replace-with-local-password",
    "SUPABASE_DB_" + "PASSWORD=",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example",
    "DATABASE_URL=placeholder",
  ])("allows documented placeholder: %s", (source) => {
    expect(findSecret(source)).toBeNull();
  });
});
