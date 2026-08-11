import { describe, expect, it } from "vitest";
import { routeApproval } from "@/lib/domain/approval-routing";

describe("routeApproval", () => {
  it.each([
    {
      input: {
        mode: "fixed_two_level" as const,
        amount: "10",
        threshold: null,
        hasEscalationException: false,
      },
      expected: { levels: 2, reason: "fixed" },
    },
    {
      input: {
        mode: "threshold" as const,
        amount: "999",
        threshold: "1000",
        hasEscalationException: false,
      },
      expected: { levels: 1, reason: "under_threshold" },
    },
    {
      input: {
        mode: "threshold" as const,
        amount: "1000",
        threshold: "1000",
        hasEscalationException: false,
      },
      expected: { levels: 2, reason: "threshold_met" },
    },
    {
      input: {
        mode: "threshold" as const,
        amount: "1",
        threshold: "1000",
        hasEscalationException: true,
      },
      expected: { levels: 2, reason: "exception" },
    },
  ])("routes $input.mode to $expected.levels level(s)", ({ input, expected }) => {
    expect(routeApproval(input)).toEqual(expected);
  });

  it("rejects threshold mode without a valid threshold", () => {
    expect(() =>
      routeApproval({
        mode: "threshold",
        amount: "10",
        threshold: null,
        hasEscalationException: false,
      }),
    ).toThrow("Approval threshold is required");
  });
});
