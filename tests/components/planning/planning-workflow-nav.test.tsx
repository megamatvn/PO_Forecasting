import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanningWorkflowNav } from "@/features/planning/components/planning-workflow-nav";

describe("PlanningWorkflowNav", () => {
  it("uses route links rather than tabs and preserves plan context", () => {
    render(
      <PlanningWorkflowNav
        step="not-a-step"
        basePath="/planning/cycle-2026"
        brandId="brand-etx"
        versionId="version-1"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Các bước lập kế hoạch" }),
    ).toBeVisible();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("link", { name: "Gửi duyệt" })).toHaveAttribute(
      "href",
      "/planning/cycle-2026?step=submit&brandId=brand-etx&versionId=version-1",
    );
  });
});
