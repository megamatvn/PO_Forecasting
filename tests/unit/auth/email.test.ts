import { describe, expect, it } from "vitest";
import { normalizeLoginEmail } from "@/features/auth/email";

describe("normalizeLoginEmail", () => {
  it("adds the default Sagen domain to a trimmed prefix", () => {
    expect(normalizeLoginEmail("  Admin  ")).toBe("admin@sagen-groupe.com");
  });

  it("does not append the domain twice to a complete email", () => {
    expect(normalizeLoginEmail(" Admin@SAGEN-GROUPE.COM ")).toBe(
      "admin@sagen-groupe.com",
    );
  });

  it("keeps a complete non-Sagen email usable for existing accounts", () => {
    expect(normalizeLoginEmail(" Planner@partner.example ")).toBe(
      "planner@partner.example",
    );
  });
});
