import { describe, expect, it } from "vitest";
import { canPerform, type AppRole } from "@/features/auth/permissions";

describe("canPerform", () => {
  it("allows an administrator to perform every action", () => {
    const roles = new Set<AppRole>(["administrator"]);

    expect(canPerform(roles, "view")).toBe(true);
    expect(canPerform(roles, "edit_plan")).toBe(true);
    expect(canPerform(roles, "approve_l1")).toBe(true);
    expect(canPerform(roles, "approve_l2")).toBe(true);
    expect(canPerform(roles, "administer")).toBe(true);
  });

  it("keeps planner and approver responsibilities separate", () => {
    expect(canPerform(new Set<AppRole>(["planner"]), "edit_plan")).toBe(true);
    expect(canPerform(new Set<AppRole>(["planner"]), "approve_l1")).toBe(false);
    expect(canPerform(new Set<AppRole>(["approver_l1"]), "approve_l1")).toBe(true);
    expect(canPerform(new Set<AppRole>(["approver_l1"]), "edit_plan")).toBe(false);
  });

  it("allows a viewer to view but never mutate or administer", () => {
    const roles = new Set<AppRole>(["viewer"]);

    expect(canPerform(roles, "view")).toBe(true);
    expect(canPerform(roles, "edit_plan")).toBe(false);
    expect(canPerform(roles, "approve_l1")).toBe(false);
    expect(canPerform(roles, "approve_l2")).toBe(false);
    expect(canPerform(roles, "administer")).toBe(false);
  });
});
