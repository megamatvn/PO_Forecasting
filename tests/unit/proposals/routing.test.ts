import { describe, expect, it } from "vitest";
import { deriveProposalRoute, type ProposalRoutingInput } from "@/features/proposals/domain/routing";

const base: ProposalRoutingInput = { mode: "forced_two_level", thresholdAmount: null, referenceAmount: "0", anyLineOverPlan: false };

describe("deriveProposalRoute", () => {
  it("keeps the default policy at two levels", () => {
    expect(deriveProposalRoute(base)).toMatchObject({ route: "manager_then_executive", reason: "forced_two_level" });
  });

  it("uses one level strictly below a threshold and two at the boundary", () => {
    expect(deriveProposalRoute({ ...base, mode: "threshold", thresholdAmount: "1000", referenceAmount: "999.99" })).toMatchObject({ route: "manager_only", reason: "under_threshold" });
    expect(deriveProposalRoute({ ...base, mode: "threshold", thresholdAmount: "1000", referenceAmount: "1000" })).toMatchObject({ route: "manager_then_executive", reason: "threshold_met" });
  });

  it("always escalates when any line is over the remaining PO capacity", () => {
    expect(deriveProposalRoute({ ...base, mode: "threshold", thresholdAmount: "100000", referenceAmount: "1", anyLineOverPlan: true })).toMatchObject({ route: "manager_then_executive", reason: "over_plan" });
  });

  it("rejects invalid threshold configuration", () => {
    expect(() => deriveProposalRoute({ ...base, mode: "threshold", thresholdAmount: null })).toThrow(/hạn mức/i);
    expect(() => deriveProposalRoute({ ...base, referenceAmount: "-1" })).toThrow(/giá trị/i);
  });
});
