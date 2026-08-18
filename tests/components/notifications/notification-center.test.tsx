import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "@/features/notifications/components/notification-center";

describe("NotificationCenter", () => {
  it("shows unread approval information and marks it read without losing the item", async () => {
    const user = userEvent.setup(); const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<NotificationCenter initialNotifications={[{ id: "90000000-0000-4000-8000-000000000001", kind: "proposal_approval_required", title: "Cần phê duyệt đề xuất", body: "ET-015025 cần ghi nhận vào PO #1.", href: "/proposals/90000000-0000-4000-8000-000000000302", readAt: null, createdAt: "2026-01-01T08:00:00Z" }]} />);
    expect(screen.getByText("Cần phê duyệt đề xuất")).toBeVisible();
    await user.click(screen.getByRole("link", { name: /Cần phê duyệt đề xuất/ }));
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/notifications/90000000-0000-4000-8000-000000000001/read", expect.objectContaining({ method: "POST" }));
    fetchMock.mockRestore();
  });
});
