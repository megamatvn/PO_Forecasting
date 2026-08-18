import { describe, expect, it } from "vitest";
import {
  canUseBrandCapability,
  canUseCapability,
} from "@/features/auth/permissions";

describe("canUseCapability", () => {
  it("allows direct organization capabilities", () => {
    expect(
      canUseCapability(["create_annual_plan"], "create_annual_plan"),
    ).toBe(true);
  });

  it("rejects capabilities that are not assigned directly", () => {
    expect(
      canUseCapability(["create_purchase_proposal"], "manage_master_data"),
    ).toBe(false);
  });
});

describe("canUseBrandCapability", () => {
  const etxBrandId = "10000000-0000-0000-0000-000000000111";

  it("allows a capability when the requested brand grants it", () => {
    expect(canUseBrandCapability([{
      id: etxBrandId,
      code: "ETX",
      name: "ETX",
      capabilities: ["view_approved_plan"],
      sources: ["inherited"],
    }], etxBrandId, "view_approved_plan")).toBe(true);
  });

  it("rejects unknown brands and missing capabilities", () => {
    expect(canUseBrandCapability([{
      id: etxBrandId,
      code: "ETX",
      name: "ETX",
      capabilities: ["create_purchase_proposal"],
      sources: ["direct"],
    }], "10000000-0000-0000-0000-000000000112", "view_approved_plan")).toBe(false);
    expect(canUseBrandCapability([{
      id: etxBrandId,
      code: "ETX",
      name: "ETX",
      capabilities: ["create_purchase_proposal"],
      sources: ["direct"],
    }], etxBrandId, "view_approved_plan")).toBe(false);
  });
});
