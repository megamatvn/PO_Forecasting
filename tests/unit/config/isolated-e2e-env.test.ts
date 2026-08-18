import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const localEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56421",
  SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:56422/postgres",
  SUPABASE_PROJECT_REF: "sagen-po-forecasting",
};

function runGuard(environment: Record<string, string>) {
  return spawnSync(
    process.execPath,
    [resolve(process.cwd(), "scripts/assert-isolated-e2e-env.mjs")],
    { env: { ...process.env, ...environment }, encoding: "utf8" },
  );
}

describe("isolated E2E environment guard", () => {
  it("accepts the local Supabase target", () => {
    expect(runGuard(localEnvironment).status).toBe(0);
  });

  it("rejects a production API URL", () => {
    expect(
      runGuard({
        ...localEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "https://gouplpvviajaihtmoymv.supabase.co",
      }).status,
    ).not.toBe(0);
  });

  it("rejects remote database URLs and unknown project refs", () => {
    const result = runGuard({
      ...localEnvironment,
      SUPABASE_DB_URL: "postgresql://postgres:secret@db.example.com:5432/postgres",
      SUPABASE_PROJECT_REF: "production-ref",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SUPABASE_DB_URL");
    expect(result.stderr).toContain("SUPABASE_PROJECT_REF");
  });
});
