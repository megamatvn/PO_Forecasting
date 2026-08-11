# Vận hành localhost

## 1. Chuẩn bị

- Node.js 22, pnpm 11 và Git.
- Docker/Colima nếu chạy Supabase local.
- `.env.local` chỉ chứa URL và publishable key cho web runtime. `SUPABASE_DB_URL` chỉ được inject tạm thời khi chạy E2E tích hợp local; reset helper từ chối mọi host không phải localhost.
- Connection URI chỉ truyền tạm qua environment khi migration; không đặt trong file tracked.

## 2. Luồng làm việc hằng ngày

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Web mặc định ở `http://localhost:3000`. Nếu cổng bận, dùng `pnpm dev --port 3001` và bổ sung callback URL tương ứng trong Supabase Auth.

## 3. Database local

```bash
pnpm supabase start
pnpm supabase db reset
pnpm test:db:local
```

`db reset` chạy toàn bộ migration rồi seed danh mục ETX, năm vai trò local và Draft ETX-2026 có regression ET-015150 thiếu 2.368. Dải cổng local là 56420–56424.

GitHub CI lấy URL database local từ `supabase status`, chạy pgTAP, sau đó chạy journey Playwright thật qua Administrator → Planner → Approver L1 → Approver L2. Không dùng reset helper với project Supabase remote.

Nếu Docker báo thiếu dung lượng, kiểm tra `docker system df`; không prune image/volume của project khác khi chưa xác định chủ sở hữu. Nếu Docker báo thiếu credential helper, sửa cấu hình Docker/Colima ở máy cá nhân thay vì commit workaround vào repository.

## 4. Migration remote

```bash
pnpm supabase db push --db-url "$SUPABASE_DB_POOLER_URL" --dry-run
pnpm supabase db push --db-url "$SUPABASE_DB_POOLER_URL"
pnpm test:db:remote -- supabase/tests/database/*.test.sql
```

Luôn dry-run trước, kiểm tra tên migration theo thứ tự thời gian và chạy pgTAP sau khi push. Seed local không được chạy vào project thật.

## 5. Kiểm tra trước commit

```bash
pnpm check
```

Khi chỉ thay đổi database, chạy thêm toàn bộ pgTAP. Khi thay đổi UI, kiểm tra ít nhất 1366×768 và vùng nội dung khoảng 1086 px, không tràn ngang.

## 6. Import vận hành

Workbook nguồn được upload vào bucket private. Import luôn qua Preview → đối soát lỗi/cảnh báo → xác nhận → commit atomic. Lỗi chặn toàn bộ batch; cảnh báo phải được xác nhận; retry dùng cùng idempotency key. Không commit workbook thật vào Git.
