import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TruncatedText } from "@/components/ui/truncated-text";

describe("TruncatedText", () => {
  it("reveals the complete value on hover and keyboard focus", async () => {
    const user = userEvent.setup();
    render(<TruncatedText>Đặc trị nám chuyên sâu dung tích lớn</TruncatedText>);

    const value = screen.getByText("Đặc trị nám chuyên sâu dung tích lớn");
    const trigger = value.closest(".truncated-text");
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(trigger!);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Đặc trị nám chuyên sâu dung tích lớn",
    );

    await user.unhover(trigger!);
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeVisible();
  });
});
