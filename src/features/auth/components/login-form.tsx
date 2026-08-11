"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface Credentials {
  email: string;
  password: string;
}

type Authenticate = (
  credentials: Credentials,
) => Promise<{ error: string | null }>;

interface LoginFormProps {
  authenticate?: Authenticate;
  onSignedIn?: () => void;
}

async function authenticateWithSupabase({ email, password }: Credentials) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export function LoginForm({
  authenticate = authenticateWithSupabase,
  onSignedIn,
}: LoginFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const result = await authenticate({
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
    });

    if (result.error) {
      setErrorMessage(
        "Không thể đăng nhập. Vui lòng kiểm tra lại thông tin và thử lại.",
      );
      setIsSubmitting(false);
      return;
    }

    if (onSignedIn) {
      onSignedIn();
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
      <div className="field-group">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="ten.nguoidung@sagen.vn"
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="login-password">Mật khẩu</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          minLength={8}
          required
        />
      </div>

      {errorMessage ? (
        <p className="form-alert form-alert--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button className="button button--primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
