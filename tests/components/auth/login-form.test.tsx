import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/features/auth/components/login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("LoginForm", () => {
  it("appends the Sagen email domain when the user enters only a prefix", async () => {
    const authenticate = vi.fn().mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginForm authenticate={authenticate} onSignedIn={vi.fn()} />);

    await user.type(screen.getByLabelText("Email hoặc tiền tố email"), " admin ");
    await user.type(screen.getByLabelText("Mật khẩu"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(authenticate).toHaveBeenCalledWith({
      email: "admin@sagen-groupe.com",
      password: "secret-password",
    });
  });

  it("signs in with email/password and continues to the app", async () => {
    const authenticate = vi.fn().mockResolvedValue({ error: null });
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    render(
      <LoginForm authenticate={authenticate} onSignedIn={onSignedIn} />,
    );

    await user.type(screen.getByLabelText("Email hoặc tiền tố email"), "planner@sagen.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(authenticate).toHaveBeenCalledWith({
      email: "planner@sagen.vn",
      password: "secret-password",
    });
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("shows a safe Vietnamese error without exposing auth internals", async () => {
    const authenticate = vi
      .fn()
      .mockResolvedValue({ error: "Invalid login credentials for user" });
    const user = userEvent.setup();
    render(<LoginForm authenticate={authenticate} onSignedIn={vi.fn()} />);

    await user.type(screen.getByLabelText("Email hoặc tiền tố email"), "viewer@sagen.vn");
    await user.type(screen.getByLabelText("Mật khẩu"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể đăng nhập. Vui lòng kiểm tra lại thông tin và thử lại.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Invalid login credentials",
    );
  });
});
