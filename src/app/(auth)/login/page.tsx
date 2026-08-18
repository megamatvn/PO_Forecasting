import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-editorial" aria-labelledby="login-heading">
        <div>
          <p className="eyebrow">Sagen Group · Vận hành</p>
          <h1 id="login-heading">
            Kế hoạch rõ ràng.
            <br />
            Quyết định <em>có kiểm soát.</em>
          </h1>
        </div>
        <p className="login-editorial__note">
          Một nguồn dữ liệu chính thức cho tồn kho, kế hoạch mua hàng, phê duyệt và lịch sử phiên bản.
        </p>
      </section>

      <section className="login-panel" aria-label="Đăng nhập hệ thống">
        <div className="login-panel__inner">
          <p className="section-index">01 / Truy cập nội bộ</p>
          <h2>Chào mừng trở lại</h2>
          <p className="muted-copy">
            Sử dụng tài khoản được Sagen cấp để tiếp tục vào hệ thống.
          </p>
          <LoginForm />
          <p className="security-note">
            Dữ liệu được giới hạn theo vai trò và nhãn hàng đã phân quyền.
          </p>
        </div>
      </section>
    </main>
  );
}
