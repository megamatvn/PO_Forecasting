import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260817001000_v2_proposal_cancellation_decision.sql";

describe("proposal cancellation SQL contract", () => {
  it("adds a dedicated decision command that releases consumed capacity only on approved cancellation", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.decide_proposal_cancellation_v2");
    expect(sql).toContain("proposal_row.status not in ('cancellation_pending_manager', 'cancellation_pending_executive')");
    expect(sql).toContain("update public.capacity_reservations");
    expect(sql).toContain("status in ('held', 'consumed')");
    expect(sql).toContain("set status = 'released'");
  });

  it("redefines cancellation request handling to keep exact assignee notifications and audit writes", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.request_proposal_cancellation_v2");
    expect(sql).toContain("proposal_cancellation_requested");
    expect(sql).toContain("proposal_cancellation_required");
    expect(sql).toContain("write_audit_event");
    expect(sql).toContain("enqueue_notification_v2");
  });
});
