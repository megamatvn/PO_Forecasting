# Final Audit — PO Forecasting Web App

Ngày kiểm tra: 2026-08-12<br />
Phạm vi: `docs/superpowers/specs/2026-08-11-po-forecasting-web-app-design.md`, implementation plan tương ứng, source code, migrations, pgTAP, unit/component tests, build và CI.

## Kết luận

Implementation đã bao phủ các acceptance criteria nghiệp vụ và các finding Critical/High của vòng review trước. Audit được coi là hoàn tất sau khi workflow GitHub Actions trên commit cuối cùng chạy xanh; bằng chứng CI sẽ được ghi bổ sung ngay sau khi push.

## Ma trận yêu cầu

| Nhóm yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| ET-015150 vẫn active, thiếu và đề xuất bổ sung 2.368 | Đạt | `projection_queries.test.sql` kiểm tra projected stock `-2,368` và recommendation `2,368`; UI hiển thị alert/action |
| Amount = Qty × Ex Price; FOC không tăng Amount | Đạt | generated column/constraint trong migration; `planning_and_purchase_orders.test.sql`; export lấy Amount canonical |
| Đặc trị xanh 3 alias về ET-015025 | Đạt | `identity_and_master_data.test.sql`; canonical SKU domain mapping |
| Master/source data và import Excel định kỳ | Đạt | suppliers, product_prices, planning_settings; sales/inventory/purchased materialization; workbook parser test bằng file thật ngoài Git |
| Import staging, preview, warning/error, checksum/idempotency, không ghi đè plan đã duyệt | Đạt | `import_pipeline.test.sql`, `import_staging.test.sql`, materialization migrations |
| Approval mặc định 2 cấp; threshold theo một/nhiều brand; exception luôn escalate | Đạt | approval engine/admin/preview tests; server-derived budget, price override, approved adjustment và critical shortage |
| Version bất biến, revision và diff persisted | Đạt | revision RPC, API/UI, version diff triggers, `version_audit_concurrency.test.sql`, E2E revision journey |
| RLS theo role × brand, profile inactive mất quyền, admin scope an toàn | Đạt | migrations `00910`/`00920`; `user_access_admin`, `user_access_security`, `active_profile_enforcement` |
| CAS concurrency, idempotent actions và audit append-only | Đạt | workspace/version pgTAP; audit event cho access/revision/save/approval |
| Dashboard, timeline, export và UI workspace | Đạt | dashboard/planning/approval/version routes, Planning Grid/PO Timeline/Cash Summary/Version History tabs, canonical export test |
| Secrets không lọt source/history/browser bundle | Đạt | `pnpm check:secrets`; scanner bắt database password, URL variants, service-role/secret key và private key |

## Các bổ sung đóng finding của review

- Parser đọc đúng khu vực `Sale Forecast 2026`, `Purchased` và dừng trước bảng lặp trong `Forecast 5M`; test xác nhận ET-015150 có 12 tháng forecast và receipt.
- Import commit materialize effective Ex Price, supplier, demand, receipt và chỉ refresh Draft; planning settings mới có default tự động khi tạo brand.
- Projection bổ sung safety stock + target cover, giữ FOC là receipt, loại PO cancelled và tính shortage.
- Derived exception flags được tính server-side; thiếu Ex Price chặn Submit với thông báo nghiệp vụ.
- Submit idempotency key được khóa và bind với `planVersionId` + payload; replay khác payload/version bị từ chối và replay luôn kiểm tra quyền brand trước.
- Ô demand/receipt trống được coi là zero có chủ đích; ô malformed hoặc ngày không hợp lệ được giữ cờ invalid và tạo import error để chặn commit.
- Revision có API/UI, giữ parent lineage và persisted diff viewer; E2E đi qua approve → revision → edit → compare.
- Quyền profile bị giới hạn column `display_name`; inactive profile không còn effective role/access; admin scope không thể thay quyền ngoài brand; invariant active administrator được serialize bằng advisory lock; thay đổi access ghi audit và idempotency.

## Fresh verification

Đã chạy trên working tree hiện tại:

- `pnpm lint` — PASS.
- `pnpm typecheck` — PASS.
- `pnpm test:coverage` — 35 test files, 88 tests PASS; Statements 78.82%, Branches 62.19%, Functions 81.54%, Lines 80.60%.
- `pnpm build` — PASS; production routes gồm revision API.
- `pnpm check:secrets` — PASS cho tracked files, Git history và browser assets.
- `pnpm verify:production-harness` — PASS; production reset route trả 404.
- Remote `pnpm test:db:remote supabase/tests/database/*.test.sql` — 16 file, 138 assertion PASS.
- Remote `pnpm supabase db lint --level warning --fail-on warning` — `No schema errors found`.
- Remote catalog check — toàn bộ 29 bảng nghiệp vụ trong schema `public` có `relrowsecurity = true`.
- Migration ledger Supabase — đồng bộ đến `20260811001040_fix_submit_derived_exceptions.sql`.

## Môi trường và giới hạn kiểm tra

Supabase remote đã được kiểm tra đầy đủ. Supabase local trên máy phát triển không khởi động được vì Docker/Colima hết dung lượng tại `pg_wal`; lệnh stop scoped đã được chạy để dọn riêng stack này. Chromium E2E đầy đủ phải lấy bằng chứng từ GitHub Actions trên Ubuntu isolated Supabase, không coi lỗi dung lượng local là lỗi ứng dụng.

## Bằng chứng CI cuối cùng

Sau khi push commit audit cuối, cập nhật tại đây:

- Commit: pending push.
- Workflow: pending run.
- Kết quả: pending; chỉ kết luận Final Audit PASS khi tất cả lint, typecheck, unit coverage, local pgTAP, build, secret scan, production harness và Chromium E2E đều xanh.
