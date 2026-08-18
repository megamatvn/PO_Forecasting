# Purchase Planning V2 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn tất Purchase Planning V2 thành một ứng dụng thống nhất, chạy hoàn toàn trên contract V2, được kiểm chứng với database thật trước khi loại bỏ legacy và thực hiện cutover production.

**Architecture:** Giữ modular monolith Next.js + Supabase hiện tại, nhưng chấm dứt trạng thái runtime lai giữa legacy và V2. Sửa dữ liệu nền trước, chuyển access/navigation và các màn hình chính sang V2, sau đó kiểm chứng toàn bộ vertical slice trên môi trường Supabase không phải production. Cutover chỉ diễn ra sau backup/restore rehearsal và một phê duyệt production riêng.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Supabase/PostgreSQL/RLS/pgTAP, Zod, Decimal.js, Vitest, Playwright, ExcelJS.

## Global Constraints

- Tài liệu đặc tả `docs/superpowers/specs/2026-08-17-purchase-planning-v2-design.md` là nguồn nghiệp vụ duy nhất; kế hoạch cũ ngày 2026-08-17 chỉ còn giá trị lịch sử.
- Không dùng `planning_cycles`, `plan_versions`, `approval_requests`, `user_roles` hoặc `user_brand_access` trong runtime V2 sau Task 5 của kế hoạch này.
- Chỉ tạo kế hoạch cho năm hiện tại hoặc tương lai; UI không giới hạn cứng ở ba năm nếu người dùng cần năm xa hơn.
- Draft kế hoạch và draft đề xuất chỉ owner đọc/sửa; pending chỉ submitter và exact approver; approved baseline theo capability/phạm vi brand.
- Mỗi PO lưu riêng `order_month` và `arrival_month`; không được nén hai giá trị thành một `needed_month`.
- Amount luôn bằng Paid Qty × Ex Price; FOC không làm tăng Amount.
- Tổng Qty và FOC theo từng SKU trên mọi PO phải khớp annual line trước submit.
- Runtime, menu và copy cuối cùng chỉ dùng tiếng Việt/Sagen; không còn luồng import Excel legacy.
- Không chạy destructive migration, reset business data hoặc E2E cleanup trên Supabase production.
- App localhost có thể tiếp tục dùng production theo cấu hình hiện tại; database-real test/cutover rehearsal phải dùng Supabase test riêng hoặc container CI cô lập.
- Không commit/push/PR nếu chưa có quyền Git cụ thể cho đợt triển khai.

---

## Rebaseline Audit — 2026-08-18

### Đã có và có bằng chứng unit/static

- V2 organization/capability, brand/SKU commands, annual-plan wizard, Excel template, proposal workflow, notification center và Sagen UI đều đã có mã nguồn.
- Fresh verification: `pnpm test` đạt 94 files / 301 tests; `pnpm lint`, `pnpm typecheck`, `git diff --check` đạt.
- Playwright liệt kê 24 scenarios, gồm năm role V2, nhưng mới là test discovery chứ chưa chạy với database thật.

### Chưa thể coi là hoàn tất

- Authenticated layout, sidebar và permission filter vẫn dùng `CurrentAccess`, `user_roles`, `user_brand_access` và route `/planning`, `/versions` legacy.
- Dashboard đang ghép `RoleDashboard` V2 với dashboard legacy đọc `planning_cycles`; empty state còn hướng dẫn import Excel cũ.
- Approval Center đang hiển thị đồng thời V2 annual-plan inbox và legacy `approval_requests`/`plan_projection_view`.
- Task 15 trong kế hoạch cũ chưa tạo dashboard projections, PO operations pages/API, approved-plan export hoặc navigation V2 như đã đặc tả.
- `purchase_wave_revisions` chỉ lưu `needed_month`; API nhận `orderMonth`/`arrivalMonth` nhưng chỉ ghi `arrivalMonth`, làm mất tháng đặt hàng sau reload/export/revision.
- Trang `/annual-plans` chưa có danh sách bản nháp của owner, pending/approved plan và hành động tiếp tục/tạo revision rõ ràng.
- pgTAP và Playwright database-real chưa chạy: `pnpm test:db:local` hiện lỗi kết nối `127.0.0.1:56422`.
- Legacy source/schema và business/demo data chưa được loại; backup/restore rehearsal chưa có bằng chứng.

### Quyết định điều phối

- Task 1–14 cũ được xem là **implementation present, integration acceptance pending**.
- Task 15 cũ được mở lại và tách thành Tasks 2, 4, 5 dưới đây.
- Task 16 cũ là **visual baseline present, browser acceptance pending**.
- Task 17 cũ chỉ là **cutover preparation**; không được chạy trước khi Tasks 1–6 của kế hoạch này xanh.

---

## File Structure Map

### Annual-plan and stable PO core

- `supabase/migrations/20260818000300_v2_purchase_wave_months_and_guards.sql` — bổ sung order/arrival month và stable-wave guards.
- `src/app/api/v2/annual-plans/[revisionId]/waves/route.ts` — chuyển DTO hai tháng vào DB command.
- `src/features/annual-plans/server/load-annual-plan.ts` — đọc lại hai tháng canonical.
- `src/features/annual-plans/excel/` — bảo toàn hai tháng qua template/preview/apply.

### V2 runtime shell

- `src/features/organization/server/get-organization-context.ts` — nguồn access duy nhất.
- `src/components/navigation/navigation-model.ts` — menu capability-based V2.
- `src/app/(app)/layout.tsx` — layout không còn gọi legacy access DAL.
- `src/components/ui/app-sidebar.tsx`, `src/components/navigation/mobile-navigation.tsx` — nhận `CurrentAccessV2`.

### V2 work surfaces

- `src/app/(app)/annual-plans/` — catalog, create/resume, history.
- `src/features/dashboard/` và `src/app/(app)/purchase-waves/` — dashboard approved baseline và PO operations.
- `src/app/(app)/approvals/page.tsx` — work queue hợp nhất cho annual plan, proposal và cancellation.

### Verification and cutover

- `supabase/tests/database/v2_*.test.sql` — RLS, commands, concurrency, projections.
- `tests/e2e/v2-*.spec.ts` — five-role vertical slices.
- `scripts/backup-business-data.mjs`, `scripts/verify-v2-cutover.mjs` — backup/rehearsal/cutover evidence.
- `supabase/migrations/20260817000900_v2_cutover_and_business_data_reset.sql` — destructive runner, chỉ gọi sau exact approval.

---

### Task 1: Repair Purchase-Wave Month Semantics and Stable Identity

**Files:**
- Create: `supabase/migrations/20260818000300_v2_purchase_wave_months_and_guards.sql`
- Modify: `src/app/api/v2/annual-plans/[revisionId]/waves/route.ts`
- Modify: `src/features/annual-plans/server/load-annual-plan.ts`
- Modify: `src/app/api/v2/annual-plans/[revisionId]/excel-template/route.ts`
- Modify: `src/features/annual-plans/excel/parser.ts`
- Modify: `src/features/annual-plans/domain/validation.ts`
- Modify: `src/features/annual-plans/components/purchase-wave-step.tsx`, `src/features/annual-plans/components/annual-plan-wizard.tsx`
- Test: `supabase/tests/database/v2_annual_plan_core.test.sql`
- Test: `tests/unit/annual-plans/purchase-wave-route.test.ts`
- Test: `tests/unit/annual-plans/excel-template.test.ts`
- Test: `tests/unit/annual-plans/excel-parser.test.ts`

**Interfaces:**
- `purchase_wave_revisions.order_month date` và `arrival_month date`, đều là ngày đầu tháng tại DB boundary.
- `save_purchase_wave_allocations_v2` nhận mỗi wave có `orderMonth` và `arrivalMonth` dạng `YYYY-MM-01`.
- API/UI tiếp tục dùng `YYYY-MM` và trả lại đúng hai giá trị sau reload/revision/export.

- [x] **Step 1: Viết RED tests cho round-trip hai tháng**

```ts
expect(rpc).toHaveBeenCalledWith("save_purchase_wave_allocations_v2", expect.objectContaining({
  p_waves: [expect.objectContaining({
    orderMonth: "2027-02-01",
    arrivalMonth: "2027-04-01",
  })],
}));
```

pgTAP phải chứng minh `order_month <= arrival_month`, cả hai thuộc năm kế hoạch, revision clone giữ nguyên hai tháng, và stable PO có proposal/status vận hành không bị hard delete.

- [x] **Step 2: Chạy RED**

Run: `pnpm vitest run tests/unit/annual-plans/purchase-wave-route.test.ts tests/unit/annual-plans/excel-template.test.ts tests/unit/annual-plans/excel-parser.test.ts`

Expected: FAIL vì route/loader hiện chỉ lưu `neededMonth`.

- [x] **Step 3: Thêm migration tương thích dữ liệu**

Backfill `order_month = needed_month`, `arrival_month = needed_month`, thêm constraints tháng/năm và đổi command/clone logic sang hai cột bằng migration append-only. Không sửa migration đã triển khai. Giữ `needed_month` tạm thời chỉ nếu proposal code còn cần trong cùng migration; loại nó khi toàn bộ consumer đã chuyển.

- [x] **Step 4: Sửa API, loader và Excel adapter**

Không dùng source payload để “giả” round-trip. Canonical response phải lấy hai tháng từ database result.

- [x] **Step 5: Chạy GREEN**

Run: `pnpm vitest run tests/unit/annual-plans tests/components/annual-plans && pnpm lint && pnpm typecheck`

Expected: PASS; thay `orderMonth` khác `arrivalMonth`, reload vẫn giữ nguyên.

---

### Task 2: Cut Authenticated Shell and Navigation to CurrentAccessV2

**Files:**
- Modify: `src/features/auth/access-types.ts`
- Modify: `src/features/auth/permissions.ts`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/navigation/navigation-model.ts`
- Modify: `src/components/ui/app-sidebar.tsx`
- Modify: `src/components/navigation/mobile-navigation.tsx`
- Modify: `src/components/navigation/brand-switcher.tsx`
- Test: `tests/unit/navigation/v2-navigation-model.test.ts`
- Test: `tests/components/navigation/v2-app-sidebar.test.tsx`
- Test: `tests/unit/v2/runtime-cutover-boundary.test.ts`

**Interfaces:**
- Layout consumes only `getOrganizationContext(): Promise<CurrentAccessV2 | null>`.
- Navigation groups: `Công việc`, `Kế hoạch & thực hiện`, `Hệ thống`.
- V2 destinations: `/dashboard`, `/annual-plans`, `/proposals`, `/purchase-waves`, `/approvals`, `/notifications`, `/master-data/*`, `/admin/*`.

- [x] **Step 1: Viết RED navigation/cutover tests**

Tests phải fail nếu runtime files chứa `/planning`, `/versions`, `getCurrentAccess(`, `user_roles` hoặc `user_brand_access`. Test capability matrix cho Leader, Manager, Executive, Administrator và Viewer; mỗi URL chỉ có một `aria-current`.

- [x] **Step 2: Chạy RED**

Run: `pnpm vitest run tests/unit/navigation tests/components/navigation tests/unit/v2/runtime-cutover-boundary.test.ts`

Expected: FAIL vì layout/navigation hiện vẫn là legacy.

- [x] **Step 3: Chuyển shell sang V2 access**

Thay role checks bằng `tier`, `isAdministrator`, global capabilities và brand capabilities. Brand/year query chỉ được giữ nếu người dùng có phạm vi hợp lệ.

- [x] **Step 4: Chuyển toàn bộ menu sang route V2**

Không render route legacy trong sidebar/mobile drawer. Admin thấy master data và governance; Leader không thấy baseline nếu thiếu `view_approved_plan` nhưng vẫn thấy `Đề xuất mua hàng`.

- [x] **Step 5: Chạy GREEN và build**

Run: `pnpm vitest run tests/unit/navigation tests/components/navigation tests/unit/v2/runtime-cutover-boundary.test.ts && pnpm lint && pnpm typecheck && pnpm build`

---

### Task 3: Complete Annual-Plan Catalog, Resume and Revision UX

**Files:**
- Create: `src/features/annual-plans/server/load-annual-plan-catalog.ts`
- Create: `src/features/annual-plans/components/annual-plan-catalog.tsx`
- Modify: `src/app/(app)/annual-plans/page.tsx`
- Modify: `src/app/(app)/annual-plans/new/page.tsx`
- Modify: `src/features/annual-plans/server/load-annual-plan.ts`
- Modify: `src/features/annual-plans/components/annual-plan-wizard.tsx`
- Test: `tests/components/annual-plans/annual-plan-catalog.test.tsx`
- Test: `tests/unit/annual-plans/annual-plan-catalog-loader.test.ts`
- Test: `tests/e2e/v2-annual-plan.spec.ts`

**Interfaces:**
- Catalog DTO tách `myDrafts`, `myPending`, `approvedBaselines`, `revisionHistory`.
- Draft conflict của người khác trả metadata generic, không lộ owner/lines.
- Year control chấp nhận mọi integer từ current year đến 2200; UI mặc định current year và cho nhập/chọn năm xa hơn.

- [x] **Step 1: Viết RED catalog/privacy tests**

Owner thấy nút `Tiếp tục bản nháp`; Manager/Executive khác không thấy draft; approved baseline hiển thị theo `view_approved_plan`; tạo revision chỉ từ approved baseline.

- [x] **Step 2: Chạy RED**

Run: `pnpm vitest run tests/components/annual-plans/annual-plan-catalog.test.tsx tests/unit/annual-plans/annual-plan-catalog-loader.test.ts`

- [x] **Step 3: Implement catalog và year control**

`/annual-plans` trở thành trang làm việc chính, không chỉ có một nút tạo mới. Tất cả status dùng tiếng Việt và link giữ brand/year/revision context.

- [x] **Step 4: Verify wizard completion screen**

Sau submit/auto-approve hiển thị màn hình kết quả; không quay lại form nhập như bước thứ năm. `Lưu nháp và thoát` quay về catalog.

- [x] **Step 5: Chạy GREEN**

Run: `pnpm vitest run tests/unit/annual-plans tests/components/annual-plans && pnpm lint && pnpm typecheck`

---

### Task 4: Build the Actual V2 Dashboard and Purchase-Wave Operations

**Files:**
- Create: `supabase/migrations/20260818000400_v2_dashboard_projections_and_wave_operations.sql`
- Create: `supabase/tests/database/v2_dashboard_projections.test.sql`
- Modify: `src/features/dashboard/contracts.ts`
- Modify: `src/features/dashboard/server/load-role-dashboard.ts`
- Create: `src/features/dashboard/components/action-summary.tsx`
- Create: `src/features/dashboard/components/plan-health-metrics.tsx`
- Create: `src/features/dashboard/components/purchase-wave-progress.tsx`
- Create: `src/features/dashboard/components/exception-list.tsx`
- Create: `src/features/dashboard/server/export-approved-plan.ts`
- Create: `src/app/(app)/purchase-waves/page.tsx`
- Create: `src/app/(app)/purchase-waves/[waveId]/page.tsx`
- Create: `src/app/api/v2/purchase-waves/[waveId]/operations/route.ts`
- Create: `src/app/api/v2/reports/approved-plan/route.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Test: `tests/unit/dashboard/dashboard-projections.test.ts`
- Test: `tests/unit/dashboard/export-approved-plan.test.ts`
- Test: `tests/components/dashboard/role-dashboard.test.tsx`
- Test: `tests/e2e/v2-dashboard-operations.spec.ts`

**Interfaces:**
- Dashboard loader signature: `loadRoleDashboard(context, brandId, planningYear): Promise<RoleDashboardDTO>`.
- Chỉ approved baseline đóng góp metrics; draft/pending không xuất hiện.
- PO operation command hỗ trợ `planned → ordered → supplier_confirmed → received`, số PO chính thức và exact dates, nhưng giữ plan months để đối chiếu.

- [x] **Step 1: Viết RED projection/privacy tests**

Leader thiếu baseline permission chỉ nhận own proposal actions. Manager nhận team/PO data. Executive nhận portfolio. Administrator nhận governance signals. Mỗi query chỉ trả brand/year được cấp.

- [x] **Step 2: Chạy RED**

Run: `pnpm vitest run tests/unit/dashboard tests/components/dashboard`

- [x] **Step 3: Implement security-invoker projections và loader**

Không query `planning_cycles`, `plan_versions` hoặc legacy report loaders. Dashboard có action-first band, four contextual metrics, PO progress và exceptions.

- [x] **Step 4: Implement PO operations và approved export**

Hủy PO có proposal active trả `409 ACTIVE_PROPOSAL_REASSIGNMENT_REQUIRED` nếu chưa chuyển toàn bộ proposal trong cùng transaction. Export chỉ approved baseline, tính Amount server-side và đặt tên `Sagen_<brand>_<year>_Ke_hoach_mua_hang.xlsx`.

- [x] **Step 5: Chạy GREEN**

Run: `pnpm vitest run tests/unit/dashboard tests/components/dashboard && pnpm lint && pnpm typecheck && pnpm build`

---

### Task 5: Unify the V2 Approval Work Center

**Files:**
- Modify: `src/app/(app)/approvals/page.tsx`
- Modify: `src/features/approvals/server/load-approval-inbox.ts`
- Create: `src/features/approvals/contracts-v2.ts`
- Create: `src/features/approvals/components/v2-approval-work-center.tsx`
- Modify: `src/features/annual-plans/components/annual-plan-approval-inbox.tsx`
- Modify: `src/features/proposals/components/proposal-review.tsx`
- Test: `tests/unit/approvals/v2-approval-inbox.test.ts`
- Test: `tests/components/approvals/v2-approval-work-center.test.tsx`
- Test: `tests/e2e/v2-proposal-approval.spec.ts`

**Interfaces:**
- Work queue chứa `annual_plan`, `purchase_proposal`, `proposal_cancellation` với exact assignee và deep link.
- Không gọi `loadApprovalInbox(CurrentAccess)` hoặc đọc `approval_requests`, `version_diffs`, `plan_projection_view`.

- [x] **Step 1: Viết RED mixed-workflow tests**

Manager chỉ thấy proposal/cancellation được gán trực tiếp; Executive chỉ thấy annual plan/L2 được gán trực tiếp; Administrator không được dùng quyền quản trị để tự quyết định hồ sơ nếu không là assignee.

- [x] **Step 2: Chạy RED**

Run: `pnpm vitest run tests/unit/approvals/v2-approval-inbox.test.ts tests/components/approvals/v2-approval-work-center.test.tsx`

- [x] **Step 3: Implement V2-only loader/UI**

Hiển thị loại hồ sơ, người gửi, brand/year, cấp hiện tại, cảnh báo over-plan, PO được ghép và hành động hợp lệ. Lỗi API giữ stable code/correlation ID và không trả raw SQL.

- [x] **Step 4: Chạy GREEN**

Run: `pnpm vitest run tests/unit/approvals tests/components/approvals tests/components/proposals && pnpm lint && pnpm typecheck`

---

### Task 6: Run Database-Real Acceptance in an Isolated Environment

**Files:**
- Modify as findings require: `supabase/migrations/20260817*.sql`, `supabase/migrations/20260818*.sql`
- Modify: `src/app/api/e2e/reset/route.ts`
- Modify: `tests/e2e/v2-support.ts`
- Modify: `.github/workflows/ci.yml`
- Test: all `supabase/tests/database/v2_*.test.sql`
- Test: all `tests/e2e/v2-*.spec.ts`

**Interfaces:**
- Test environment must reject any URL/project ref matching production.
- Five real roles authenticate through Supabase Auth; tests create UUID-suffixed brand/cycle and clean only their own data.

- [ ] **Step 1: Provision isolated Supabase test target**

Use an ephemeral CI Supabase container or a separate Supabase staging project. Do not point `SUPABASE_DB_URL`, `NEXT_PUBLIC_SUPABASE_URL` or reset token at production.

- [ ] **Step 2: Replay migrations from zero and run pgTAP**

Run: `pnpm test:db:local` in CI/container, or the equivalent remote-test runner against staging.

Expected: all legacy + V2 tests PASS; no migration replay error.

- [ ] **Step 3: Run database-real Playwright**

Run: `pnpm e2e:local` against the isolated app/database pair.

Expected scenarios: Manager plan → exact Executive; Executive self-approve; draft privacy; Excel/manual parity; Leader proposal; one/two-level; over-plan; Manager self-proposal; cancellation; admin transfer; Sagen-prefix login; V2 dashboard/navigation.

- [ ] **Step 4: Fix findings via RED-GREEN cycles**

Mỗi lỗi integration phải có regression test tại tầng thấp nhất phù hợp trước khi sửa. Không dùng mock-only green để đóng task.

- [ ] **Step 5: Run full matrix**

Run:

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
git diff --check
```

Expected: tất cả PASS; Playwright thực sự chạy, không chỉ `--list` hoặc skip.

---

### Task 7: Remove Legacy Runtime and Rehearse Backup/Restore/Cutover

**Files:**
- Delete: exact legacy routes/features/tests listed in Task 17 of `2026-08-17-purchase-planning-v2-implementation.md`
- Modify: `scripts/backup-business-data.mjs`
- Create: `scripts/restore-business-data.mjs`
- Modify: `scripts/verify-v2-cutover.mjs`
- Modify: `supabase/migrations/20260817000900_v2_cutover_and_business_data_reset.sql`
- Modify: `README.md`
- Test: `tests/unit/e2e/cutover-guards.test.ts`
- Test: `tests/unit/e2e/backup-restore-contract.test.ts`

**Interfaces:**
- Backup manifest chứa row counts, SHA-256 cho từng artifact, retained Admin ID và schema/migration version.
- Restore script chỉ chạy trên non-production và xác minh row counts/hash sau restore.
- Cutover vẫn yêu cầu session token `BUSINESS_DATA_BACKED_UP` và không dùng `CASCADE`.

- [ ] **Step 1: Viết RED source-boundary và backup-order tests**

Fail nếu source runtime còn `/planning`, `/versions`, `/imports`, legacy auth DAL hoặc legacy report/approval modules. Backup SQL phải theo FK-safe order, gồm V2 organization permissions cần phục hồi và có hash verification.

- [ ] **Step 2: Xóa legacy source sau khi Task 6 đã xanh**

Xóa đúng danh sách Task 17 cũ; giữ historical migrations. Cập nhật imports/tests/navigation/README để build không còn tham chiếu.

- [ ] **Step 3: Rehearse backup → cutover → verify → restore**

Chạy hoàn toàn trên isolated test DB. Ghi lại backup hash, row counts trước/sau, danh sách table/type/function bị drop và restore verification.

- [ ] **Step 4: Re-run full matrix trên final source**

Expected: tất cả lệnh Task 6 PASS; `verify-v2-cutover` xác nhận một retained Admin, capability đúng, brand permissions rỗng, legacy schema/source bằng 0.

---

### Task 8: Production Cutover Checkpoint and Smoke Test

**Files:**
- No source edits unless a rehearsed migration defect is found.
- Produce: `.superpowers/sdd/2026-08-18-purchase-planning-v2-completion/production-cutover-evidence.md`

**Interfaces:**
- Input evidence: backup hashes, restore rehearsal, exact retained/deleted row counts, migration diff, rollback command, full verification matrix.
- Output: explicit user approval or no production action.

- [ ] **Step 1: Present exact production action**

Nêu rõ database/project, migration function được gọi, bảng/dòng bị xóa, Admin được giữ, backup path/hash và rollback command. Không gộp phê duyệt này với phê duyệt kế hoạch triển khai.

- [ ] **Step 2: Execute only after explicit approval**

Set token và gọi cutover trong cùng controlled database session. Nếu bất kỳ guard nào fail, transaction phải rollback toàn bộ.

- [ ] **Step 3: Post-cutover smoke**

Xác minh Admin login; tạo brand/SKU; tạo draft; Manager submit; Executive approve; Leader proposal; notification; dashboard approved baseline; Excel template download/import.

- [ ] **Step 4: Git lifecycle checkpoint**

Chỉ commit/push/PR sau khi user chọn hành động Git riêng và fresh verification vẫn xanh.

---

## Completion Gate

Không tuyên bố V2 hoàn tất khi thiếu bất kỳ điều kiện nào:

1. Runtime không còn legacy access/navigation/dashboard/approval data path.
2. Order month và arrival month round-trip độc lập qua UI/API/DB/Excel/revision.
3. Annual plan catalog/resume/revision hoạt động đúng draft privacy.
4. Dashboard chỉ đọc approved baseline và role-specific scope.
5. Approval Center chỉ dùng exact V2 assignee/workflow.
6. pgTAP và five-role Playwright chạy thật và PASS.
7. Backup/restore/cutover rehearsal PASS trên non-production.
8. Legacy source/schema/data được loại đúng danh sách.
9. Production cutover có exact approval và post-cutover smoke PASS.
