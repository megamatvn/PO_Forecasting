import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VersionHistory } from "@/features/versions/components/version-history";

const versions = [
  {
    id: "version-4",
    cycleCode: "ETX-2026",
    cycleName: "ETX Forecast 2026",
    brandCode: "ETX",
    brandName: "Etiaxil",
    planningYear: 2026,
    versionNumber: 4,
    status: "approved" as const,
    createdAt: "2026-08-11T08:30:00.000Z",
  },
  {
    id: "version-3",
    cycleCode: "ABC-2025",
    cycleName: "ABC Forecast 2025",
    brandCode: "ABC",
    brandName: "ABC",
    planningYear: 2025,
    versionNumber: 3,
    status: "changes_requested" as const,
    createdAt: "2026-08-10T08:30:00.000Z",
  },
];

describe("VersionHistory", () => {
  it("uses Vietnamese version/status labels and filters by brand, year and status", async () => {
    const user = userEvent.setup();
    render(<VersionHistory versions={versions} />);

    expect(screen.getByRole("columnheader", { name: "Phiên bản" })).toBeVisible();
    expect(
      screen.getByRole("columnheader", { name: "Nhãn hàng và kế hoạch" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Xem phiên bản 4" })).toHaveAttribute(
      "href",
      "/versions/version-4",
    );
    expect(screen.getByText("Phiên bản 4")).toBeVisible();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Đã duyệt")).toBeVisible();
    expect(within(table).getByText("Yêu cầu sửa")).toBeVisible();
    expect(screen.queryByText("Version 4")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Nhãn hàng"), "ABC");
    expect(screen.queryByText("Phiên bản 4")).not.toBeInTheDocument();
    expect(screen.getByText("Phiên bản 3")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Năm kế hoạch"), "2025");
    await user.selectOptions(screen.getByLabelText("Trạng thái"), "changes_requested");
    expect(within(screen.getByRole("table")).getByText("Yêu cầu sửa")).toBeVisible();
    expect(screen.getByRole("link", { name: "Xem phiên bản 3" })).toHaveAttribute(
      "href",
      "/versions/version-3",
    );
  });
});
