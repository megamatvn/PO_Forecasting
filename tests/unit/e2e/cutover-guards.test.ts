import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("V2 cutover safety boundary", () => {
  it("requires a reset token and local E2E mode", () => {
    const route = readFileSync(resolve(process.cwd(), "src/app/api/e2e/reset/route.ts"), "utf8");
    expect(route).toContain('process.env.E2E_MODE !== "true"');
    expect(route).toContain("E2E_RESET_TOKEN");
    expect(route).toContain("x-e2e-reset-token");
    expect(route).toContain('operation: z.enum(["register", "cleanup"])');
    expect(route).toContain("e2e_scenario_runs");
    expect(route).toContain("isolated_target_not_registered");
    expect(route).toContain("app.e2e_cleanup_audit");
  });

  it("guards destructive legacy cutover behind the backup confirmation setting", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260817000900_v2_cutover_and_business_data_reset.sql"), "utf8");
    expect(migration).toContain("V2_CUTOVER_BACKUP_CONFIRMATION_REQUIRED");
    expect(migration).toContain("BUSINESS_DATA_BACKED_UP");
    expect(migration).toContain("drop table if exists public.import_batches");
    expect(migration).toContain("drop type if exists public.app_role");
    expect(migration).toContain("drop policy if exists audit_events_select_by_access on public.audit_events");
    expect(migration).toContain("create policy audit_events_select_v2 on public.audit_events");
    expect(migration).toContain("drop policy if exists po_forecast_imports_select_admin on storage.objects");
    expect(migration).toContain("public.current_user_is_administrator_v2()");
  });

  it("keeps retained V2 organization functions independent of retired role tables", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260817000100_v2_organization_and_capabilities.sql"), "utf8");
    const functionBody = (name: string) => {
      const start = migration.indexOf(`create or replace function public.${name}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = migration.indexOf("\ncreate or replace function public.", start + 1);
      return migration.slice(start, next === -1 ? migration.length : next);
    };

    expect(functionBody("current_user_is_administrator_v2")).not.toMatch(/user_roles|user_brand_access|public\.roles/);
    expect(functionBody("set_user_organization_v2")).not.toMatch(/user_roles|user_brand_access|public\.roles/);
  });

  it("replaces retained profile access policy references before helper cleanup", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260817000100_v2_organization_and_capabilities.sql"), "utf8");
    const start = migration.indexOf("create policy profiles_select_own_or_admin");
    const end = migration.indexOf("drop policy if exists user_roles_select_own_or_admin", start);
    const profilePolicy = migration.slice(start, end);
    expect(profilePolicy).toContain("public.current_user_is_administrator_v2()");
    expect(profilePolicy).not.toContain("public.can_administer_user");
    expect(profilePolicy).toContain("drop policy if exists profiles_manage_admin");
  });
});
