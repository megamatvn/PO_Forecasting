import { describe, expect, it } from "vitest";
import { diffPlan } from "@/features/versions/domain/diff-plan";

describe("diffPlan", () => {
  it("reports the ET-015150 purchase increase at a stable business path", () => {
    const before = {
      purchaseLines: {
        "ET-015150": { qty: 0, focQty: 0, exPrice: "2.71" },
      },
    };
    const after = {
      purchaseLines: {
        "ET-015150": { qty: 2368, focQty: 0, exPrice: "2.71" },
      },
    };

    expect(diffPlan(before, after)).toContainEqual({
      path: "purchaseLines.ET-015150.qty",
      before: 0,
      after: 2368,
      impact: "increase",
    });
  });

  it("classifies additions, removals and decreases deterministically", () => {
    const result = diffPlan(
      { targetAmount: 1000, notes: "old", obsolete: true },
      { targetAmount: 900, notes: "new", added: "value" },
    );

    expect(result).toEqual([
      { path: "added", before: undefined, after: "value", impact: "added" },
      { path: "notes", before: "old", after: "new", impact: "changed" },
      { path: "obsolete", before: true, after: undefined, impact: "removed" },
      { path: "targetAmount", before: 1000, after: 900, impact: "decrease" },
    ]);
  });

  it("returns no entries for identical snapshots", () => {
    const snapshot = { status: "approved", values: [1, 2, 3] };

    expect(diffPlan(snapshot, structuredClone(snapshot))).toEqual([]);
  });
});
