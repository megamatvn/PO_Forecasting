import { describe, expect, it } from "vitest";
import {
  currentAccessV2Schema,
  resolveActiveBrandId,
} from "@/features/auth/access-types";

const brands = [
  { id: "brand-etx", code: "ETX", name: "ETX" },
  { id: "brand-abc", code: "ABC", name: "ABC" },
];

describe("resolveActiveBrandId", () => {
  it("uses an authorized requested brand instead of the default brand", () => {
    expect(resolveActiveBrandId(brands, "brand-abc")).toBe("brand-abc");
  });

  it("rejects an unauthorized request and keeps the authorized default", () => {
    expect(resolveActiveBrandId(brands, "brand-other")).toBe("brand-etx");
  });
});

describe("currentAccessV2Schema", () => {
  it("parses organization context with brand capability sources", () => {
    expect(currentAccessV2Schema.parse({
      userId: crypto.randomUUID(),
      displayName: "Manager Test",
      tier: "manager",
      isAdministrator: false,
      capabilities: ["create_purchase_proposal"],
      supervisorId: crypto.randomUUID(),
      executiveId: crypto.randomUUID(),
      brands: [{
        id: crypto.randomUUID(),
        code: "ETX",
        name: "ETX",
        capabilities: ["view_approved_plan", "create_purchase_proposal"],
        sources: ["direct", "inherited"],
      }],
    })).toMatchObject({
      tier: "manager",
      capabilities: ["create_purchase_proposal"],
    });
  });

  it("rejects malformed brand capability payloads", () => {
    expect(currentAccessV2Schema.safeParse({
      userId: crypto.randomUUID(),
      displayName: "Viewer Test",
      tier: "employee_viewer",
      isAdministrator: false,
      capabilities: [],
      supervisorId: null,
      executiveId: null,
      brands: [{
        id: crypto.randomUUID(),
        code: "ETX",
        name: "ETX",
        capabilities: ["not_real_capability"],
        sources: [],
      }],
    }).success).toBe(false);
  });
});
