import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deriveProposalRoute } from "@/features/proposals/domain/routing";

describe("proposal routing properties", () => {
  it("never downgrades an over-plan proposal to one-level approval", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1_000_000 }), (amount) => {
      const result = deriveProposalRoute({ mode: "threshold", thresholdAmount: "999999999", referenceAmount: String(amount), anyLineOverPlan: true });
      expect(result.route).toBe("manager_then_executive");
    }));
  });
});
