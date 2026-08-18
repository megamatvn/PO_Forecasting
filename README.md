# Sagen PO Forecasting

Ứng dụng nội bộ quản lý kế hoạch mua hàng theo năm: nhập liệu trực tiếp hoặc từ Excel mẫu, kiểm soát tồn dự kiến, duyệt theo chính sách, lưu phiên bản/audit và xuất workbook từ dữ liệu canonical.

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

Đăng nhập cho phép nhập tiền tố Sagen (ví dụ `admin` sẽ được chuẩn hóa thành
`admin@sagen-groupe.com`); người dùng vẫn có thể nhập đầy đủ địa chỉ email.

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
| Administrator | `admin@sagen-groupe.com` |
| Leader | `leader@sagen-groupe.com` |
| Manager | `manager@sagen-groupe.com` |
| CEO/BOD | `executive@sagen-groupe.com` |
| Viewer | `viewer@sagen-groupe.com` |

Mật khẩu seed local: `LocalDemo!2026`. Không dùng tài khoản hoặc mật khẩu seed này ở production.

## Kiểm thử

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:db:local
pnpm build
pnpm check:secrets
pnpm verify:production-harness
pnpm e2e:local
```

Browser suite chạy trên Supabase local thật: Auth năm seed role, import/API/RPC/RLS/persistence, brand boundary, chính sách threshold, xung đột CAS và duyệt L1→L2. Mỗi journey ghi dữ liệu tạo cycle UUID riêng qua reset helper chỉ có trong development, bắt buộc Administrator và từ chối database không phải localhost. Reset API luôn trả 404 ở production.

Phân quyền RLS, state machine duyệt, bất biến version, audit và idempotency còn được kiểm thử độc lập bằng pgTAP trên PostgreSQL.

Workflow GitHub chạy theo thứ tự cố định: cài đặt, lint, type-check, unit, coverage, pgTAP trên Supabase local, production build, secret scan trên source và `.next/static`, kiểm tra `next start` trả 404 cho reset API, rồi Chromium E2E database-real. Không chạy `next dev` giữa build và secret scan.

## Rehearsal V2 cutover

Cutover legacy là thao tác destructive và chỉ được diễn tập trên database local/test. Backup luôn từ chối Supabase production URL/project ref:

```bash
SUPABASE_DB_URL="postgres://..." pnpm backup:business
psql "$SUPABASE_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -c "set app.v2_cutover_confirmed = 'BUSINESS_DATA_BACKED_UP'; select public.perform_v2_legacy_cutover();"
SUPABASE_DB_URL="postgres://..." APP_BASE_URL="http://127.0.0.1:3000" pnpm verify:v2-cutover
```

Migration `20260817000900_v2_cutover_and_business_data_reset.sql` chỉ đăng ký hàm cutover và không tự xoá dữ liệu khi Supabase replay migration chain. Hàm `perform_v2_legacy_cutover()` tự kiểm tra token trong session; nếu không có đúng `BUSINESS_DATA_BACKED_UP` thì sẽ abort. Trước production phải dừng tại checkpoint riêng và trình bày backup hash, restore rehearsal evidence, migration diff, retained/deleted row counts, full test evidence và rollback command. Chỉ chạy production cutover sau khi có phê duyệt đúng thao tác đó.

Trong workspace hiện tại, migration cutover/reset dùng tên `20260817000900_v2_cutover_and_business_data_reset.sql`; không tạo thêm migration thứ hai cùng timestamp.

## Tài liệu

- [Đặc tả thiết kế](docs/superpowers/specs/2026-08-11-po-forecasting-web-app-design.md)
- [Kế hoạch triển khai](docs/superpowers/plans/2026-08-11-po-forecasting-web-app-implementation.md)
- [Vận hành local](docs/operations/local-development.md)
- [Xoay vòng bí mật](docs/operations/secret-rotation.md)
