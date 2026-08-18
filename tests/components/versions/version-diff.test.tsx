import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VersionDiff } from "@/features/versions/components/version-diff";

describe("VersionDiff", () => {
  it("renders ET-015150 changes in business language", () => {
    render(
      <VersionDiff
        fromLabel="Version 3"
        toLabel="Version 4"
        diffs={[
          {
            path: "purchaseLines.ET-015150.qty",
            before: 0,
            after: 2368,
            impact: "increase",
          },
          {
            path: "purchaseLines.ET-015150.exPrice",
            before: "2.50",
            after: "2.71",
            impact: "changed",
          },
        ]}
      />,
    );

    expect(screen.getByText("ET-015150 · Qty")).toBeVisible();
    expect(screen.getByText("0 → 2.368")).toBeVisible();
    expect(screen.getByText("ET-015150 · Đơn giá xuất xưởng")).toBeVisible();
  });
});
