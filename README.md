# Sagen PO Forecasting

Ứng dụng nội bộ thay thế sheet `Forecast 5M`: import Excel định kỳ, lập kế hoạch mua hàng, kiểm soát tồn dự kiến, duyệt theo chính sách, lưu version/audit và xuất workbook từ dữ liệu canonical.

## Nghiệp vụ đã khóa

- `Amount = Qty × Ex Price`; FOC tăng tồn nhưng không tăng Amount.
- ET-015025, ET-015026 và ET-015027 tự động quy về ET-015025 (`Đặc trị xanh`).
- ET-015150 vẫn active; khi chưa có PO, hệ thống cảnh báo thiếu 2.368 và đề xuất bổ sung.
- Chính sách mặc định là duyệt hai cấp. Administrator có thể chuyển sang duyệt theo hạn mức cho một hoặc nhiều nhãn hàng; ngoại lệ cấu hình có thể escalated lên hai cấp.
- Draft hỗ trợ autosave có compare-and-swap. Version đã gửi/đã duyệt là snapshot bất biến; chỉnh sửa phải tạo revision.
- Mọi dữ liệu nghiệp vụ chịu RLS theo vai trò và nhãn hàng.
- Trang `Người dùng & quyền` gán nhiều vai trò và nhiều nhãn hàng cho tài khoản Supabase đã có bằng một RPC atomic; hệ thống chặn tự tước quyền và chặn xóa Administrator cuối cùng.

## Công nghệ

Node.js 22, pnpm 11, Next.js App Router, React, TypeScript, Supabase Auth/PostgreSQL/Storage/Realtime, ExcelJS, Vitest, pgTAP và Playwright.

## Chạy localhost với Supabase project

1. Cài Node.js 22 và pnpm 11.
2. Chạy `pnpm install --frozen-lockfile`.
3. Sao chép `.env.example` thành `.env.local` rồi điền URL và publishable key của project. Không đặt database password, connection URI hay service-role key vào biến `NEXT_PUBLIC_*`.
4. Chạy `pnpm dev`, mở [http://localhost:3000](http://localhost:3000).

Để áp dụng migration vào project Supabase, dùng pooler URL chỉ trong terminal hoặc secret manager:

```bash
pnpm supabase db push --db-url "$SUPABASE_DB_POOLER_URL" --dry-run
pnpm supabase db push --db-url "$SUPABASE_DB_POOLER_URL"
```

Không ghi connection string vào repository, shell history, ảnh chụp màn hình hoặc tài liệu.

## Supabase local

Project local dùng dải cổng 56420–56424 để tránh xung đột với các project khác:

```bash
pnpm supabase start
pnpm supabase db reset
pnpm test:db:local
pnpm supabase stop --no-backup
```

`supabase db reset` tạo năm tài khoản demo, chỉ dành cho local:

| Vai trò | Email |
|---|---|
| Administrator | `admin@local.test` |
| Planner | `planner@local.test` |
| Approver L1 | `approver1@local.test` |
| Approver L2 | `approver2@local.test` |
| Viewer | `viewer@local.test` |

Mật khẩu chung local: `LocalDemo!2026`. Không dùng các tài khoản hoặc mật khẩu này ở production.

## Kiểm thử

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm test:db:local
pnpm build
pnpm e2e:local
pnpm check:secrets
```

Browser suite chạy trên Supabase local thật: Auth năm seed role, import/API/RPC/RLS/persistence, brand boundary, chính sách threshold, xung đột CAS và duyệt L1→L2. Mỗi journey ghi dữ liệu tạo cycle UUID riêng qua reset helper chỉ có trong development, bắt buộc Administrator và từ chối database không phải localhost. Reset API luôn trả 404 ở production.

Phân quyền RLS, state machine duyệt, bất biến version, audit và idempotency còn được kiểm thử độc lập bằng pgTAP trên PostgreSQL.

Workflow GitHub chạy lint, type-check, coverage, secret scan, Supabase local, pgTAP, build và Chromium E2E trên mọi pull request và push vào `main`.

## Tài liệu

- [Đặc tả thiết kế](docs/superpowers/specs/2026-08-11-po-forecasting-web-app-design.md)
- [Kế hoạch triển khai](docs/superpowers/plans/2026-08-11-po-forecasting-web-app-implementation.md)
- [Vận hành local](docs/operations/local-development.md)
- [Xoay vòng bí mật](docs/operations/secret-rotation.md)
