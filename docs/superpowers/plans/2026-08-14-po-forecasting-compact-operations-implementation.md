# PO Forecasting Compact Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển toàn bộ giao diện PO Forecasting sang hệ Compact Operations đã duyệt: chữ vừa phải, header gọn, mật độ vận hành cao, Planning dễ quét và không còn layout/copy kỹ thuật gây rối.

**Architecture:** Giữ nguyên Next.js App Router, dữ liệu Supabase, RLS, approval engine và API hiện có. Chuẩn hóa một nền typography/spacing, một `PageHeader`, một app shell compact và các component hiển thị dữ liệu nhỏ; sau đó lần lượt di chuyển từng module khỏi CSS/layout legacy. Mỗi task có test component/static contract riêng trước khi chạy acceptance responsive toàn hệ thống.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS thuần theo module, Supabase, Vitest + Testing Library, Playwright.

## Global Constraints

- Nguồn đặc tả đã duyệt: `docs/superpowers/specs/2026-08-14-po-forecasting-compact-operations-design.md`.
- Tài liệu ngày 14/08/2026 ưu tiên cho typography, spacing, card và layout; nghiệp vụ/dữ liệu tiếp tục theo đặc tả ngày 12/08/2026.
- H1 trong app shell tối đa 40px desktop và 32px mobile; dialog/form section title tối đa 24px.
- Serif chỉ dùng cho H1 cấp trang và số liệu nhấn mạnh; form, table, dialog, card title và sidebar dùng Be Vietnam Pro.
- Hệ spacing: `4, 8, 12, 16, 24, 32px`; page padding desktop 24–32px, tối đa 40px ở màn hình rất rộng.
- Không đổi schema, API contract, RLS, role, approval engine, import/versioning workflow, autosave hoặc công thức `Amount = Qty × Ex Price`.
- Không thêm dependency UI/tooltip mới; dùng React/CSS hiện có.
- Không chạy migration, reset, seed, pgTAP hoặc E2E trên Supabase production.
- Worktree đang có nhiều thay đổi chưa commit. Trước mỗi task chạy `git diff -- <write-set>`; không reset, checkout hoặc ghi đè thay đổi ngoài phạm vi.
- Không auto-commit, push, tạo PR, merge hoặc cleanup. Chỉ thực hiện Git lifecycle khi người dùng ủy quyền riêng.
- Mỗi behavior mới theo RED → GREEN → REFACTOR; chạy test hẹp trước, suite liên quan sau.
- Trước khi sửa Next.js server/client boundary hoặc CSS, đọc tài liệu bundled tương ứng trong `node_modules/next/dist/docs/`.

---

## File Structure Map

### Files to create

- `src/components/ui/truncated-text.tsx` — text một dòng có tooltip hỗ trợ hover và focus.
- `tests/components/ui/truncated-text.test.tsx` — contract accessibility của tooltip.
- `tests/unit/ui/compact-operations-css.test.ts` — static guard cho typography, legacy header, desktop back button và overflow.
- `tests/unit/ui/compact-operations-copy.test.ts` — guard copy kỹ thuật/legacy trong UI.
- `tests/e2e/compact-operations-responsive.spec.ts` — acceptance ở desktop, tablet và mobile.

### Files to modify

- Foundation/shell: `src/app/globals.css`, `src/app/styles/app-shell.css`, `dashboard.css`, `planning.css`, `administration.css`, `responsive.css`.
- Shared UI: `src/components/ui/page-header.tsx`, `plan-context-bar.tsx`, `metric-strip.tsx`, `app-sidebar.tsx`.
- Navigation: `src/components/navigation/brand-switcher.tsx`, `navigation-link.tsx`, `mobile-navigation.tsx`.
- Route headers: pages dưới `src/app/(app)/dashboard`, `planning`, `imports`, `versions`, `approvals`, `admin/approval-policies`, `admin/users`.
- Planning: `planning-header.tsx`, `kpi-strip.tsx`, `stock-alert.tsx`, `planning-product-list.tsx`, `planning-product-editor.tsx`, `planning-workspace.tsx`.
- Reports: `dashboard-kpis.tsx`, `po-timeline.tsx`.
- Import: `import-workflow.tsx`, `import-dropzone.tsx`, `import-preview.tsx`, `sheet-selector.tsx`.
- Administration: `policy-editor.tsx`, `policy-summary.tsx`, `user-access-manager.tsx`.
- Versions: `version-history.tsx`.
- Tests hiện có dưới `tests/components/**`, `tests/unit/planning/**`, `tests/unit/ui/**`.

### Shared interfaces introduced by this plan

```ts
export interface TruncatedTextProps {
  children: string;
  className?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: Array<{ label: string; href?: string }>;
  eyebrow?: string;
  actions?: React.ReactNode;
  context?: React.ReactNode;
}
```

`PageHeader.context` là metadata/badge nhỏ gần header; không tạo card độc lập. Các task sau chỉ tiêu thụ interface này, không tạo header biến thể mới.

---

### Task 1: Establish the Compact Operations foundation

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/styles/dashboard.css`
- Modify: `src/app/styles/responsive.css`
- Modify: `src/components/ui/page-header.tsx`
- Modify: `tests/components/ui/operations-primitives.test.tsx`
- Create: `tests/unit/ui/compact-operations-css.test.ts`

**Produces:** Một typography/spacing contract duy nhất và `PageHeader` đủ dùng cho mọi route.

- [ ] **Step 1: Capture the current CSS and test baseline**

Run:

```bash
git diff -- src/app/globals.css src/app/styles/dashboard.css \
  src/app/styles/responsive.css src/components/ui/page-header.tsx
pnpm vitest run tests/components/ui/operations-primitives.test.tsx \
  tests/unit/ui/responsive-css-boundary.test.ts
```

Expected: baseline hiện tại PASS; nếu có lỗi, ghi lại trước khi sửa.

- [ ] **Step 2: Write failing typography and legacy-boundary tests**

Add assertions equivalent to:

```ts
expect(css).toMatch(/\.page-header h1[\s\S]*font-size:\s*clamp\(2rem,\s*3vw,\s*2\.5rem\)/);
expect(css).toMatch(/\.page-header__description[\s\S]*line-clamp/);
expect(css).not.toMatch(/h1,\s*h2,\s*h3\s*\{[\s\S]*font-family:\s*var\(--serif\)/);
expect(css).not.toMatch(/\.page-heading\s*\{/);
```

Extend the component test:

```tsx
render(<PageHeader eyebrow="Dữ liệu" title="Import dữ liệu kế hoạch" context={<span>Bản nháp</span>} />);
expect(screen.getByText("Bản nháp")).toBeVisible();
```

Run the focused command. Expected: FAIL because global serif and `page-heading` still exist and `context` is unsupported.

- [ ] **Step 3: Extend `PageHeader` without creating another layout variant**

Use this structure:

```tsx
<header className="page-header">
  <div className="page-header__content">
    {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
    {breadcrumb ? <Breadcrumb items={breadcrumb} /> : null}
    <h1>{title}</h1>
    {description ? <p className="page-header__description">{description}</p> : null}
  </div>
  <div className="page-header__aside">
    {context ? <div className="page-header__context">{context}</div> : null}
    {actions ? <div className="page-header__actions">{actions}</div> : null}
  </div>
</header>
```

Keep breadcrumb rendering in the existing component; do not add a second component unless it becomes independently reusable.

- [ ] **Step 4: Implement the typography and density tokens**

Set operational defaults explicitly:

```css
body { font-size: 0.9375rem; line-height: 1.5; }
h1 { font-family: var(--serif); }
h2, h3 { font-family: var(--sans); letter-spacing: -0.015em; }
.page-shell { padding: clamp(1.5rem, 2.5vw, 2.5rem); }
.page-header h1 { font-size: clamp(2rem, 3vw, 2.5rem); }
.page-header__description {
  display: -webkit-box;
  max-width: 52rem;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}
```

Mobile overrides H1 to `clamp(1.625rem, 8vw, 2rem)` and description to two lines.

- [ ] **Step 5: Run foundation verification**

```bash
pnpm vitest run tests/components/ui/operations-primitives.test.tsx \
  tests/unit/ui/compact-operations-css.test.ts \
  tests/unit/ui/responsive-css-boundary.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: all PASS.

---

### Task 2: Compact the sidebar and make brand switching self-applying

**Files:**
- Modify: `src/components/navigation/brand-switcher.tsx`
- Modify: `src/components/ui/app-sidebar.tsx`
- Modify: `src/components/navigation/mobile-navigation.tsx`
- Modify: `src/app/styles/app-shell.css`
- Modify: `src/app/globals.css`
- Modify: `tests/components/navigation/app-sidebar.test.tsx`
- Modify: `tests/components/navigation/mobile-navigation.test.tsx`

**Consumes:** Existing `buildBrandSwitchHref()` and authorized brand resolution.
**Produces:** Sidebar compact, không có số thứ tự và selector không có nút bị xuống dòng.

- [ ] **Step 1: Write failing navigation density tests**

Assert:

```tsx
expect(screen.queryByRole("button", { name: "Áp dụng" })).not.toBeInTheDocument();
expect(screen.queryByText("01")).not.toBeInTheDocument();
await user.selectOptions(screen.getByRole("combobox", { name: "Nhãn hàng" }), "brand-b");
expect(push).toHaveBeenCalledWith(expect.stringContaining("brandId=brand-b"));
```

Add a static CSS assertion that `.brand-picker__control` does not use a fixed `2.75rem` action column.

Expected: FAIL on the current submit-button implementation.

- [ ] **Step 2: Replace submit with explicit `onChange` navigation**

Implement:

```tsx
function switchBrand(brandId: string) {
  if (!brandId || brandId === selectedBrandId) return;
  startTransition(() => {
    router.push(buildBrandSwitchHref(pathname, brandId, searchParams.toString()));
  });
}

<select
  value={selectedBrandId ?? ""}
  disabled={isPending}
  aria-busy={isPending || undefined}
  onChange={(event) => switchBrand(event.target.value)}
>
```

Keep brand validation and source query preservation unchanged.

- [ ] **Step 3: Remove numeric nav markers and reduce shell spacing**

Render links as label + optional semantic icon only. CSS targets:

```css
.app-frame { grid-template-columns: 16rem minmax(0, 1fr); }
.app-sidebar { padding: 1.25rem 1rem; }
.brand-picker__control { display: block; }
.brand-picker select { width: 100%; text-overflow: ellipsis; }
.primary-navigation { gap: 1rem; margin-top: 1.5rem; }
.primary-navigation a { min-height: 2.625rem; grid-template-columns: 1fr; }
```

- [ ] **Step 4: Verify desktop/mobile navigation behavior**

```bash
pnpm vitest run tests/components/navigation/app-sidebar.test.tsx \
  tests/components/navigation/mobile-navigation.test.tsx \
  tests/unit/navigation/navigation-model.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: exactly one active link, brand context preserved, drawer behavior unchanged.

---

### Task 3: Migrate every route to the shared compact PageHeader

**Files:**
- Modify: `src/app/(app)/planning/page.tsx`
- Modify: `src/app/(app)/imports/page.tsx`
- Modify: `src/app/(app)/versions/page.tsx`
- Modify: `src/app/(app)/versions/[versionId]/page.tsx`
- Modify: `src/app/(app)/approvals/page.tsx`
- Modify: `src/app/(app)/admin/approval-policies/page.tsx`
- Modify: `src/app/(app)/admin/users/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/planning/planning-index-page.test.tsx`
- Create: `tests/unit/ui/compact-operations-copy.test.ts`

**Consumes:** `PageHeaderProps` from Task 1.
**Produces:** Không còn `.page-heading`, header legacy hoặc copy kỹ thuật ở route-level UI.

- [ ] **Step 1: Write failing static route-header and copy guards**

Scan `src/app/(app)` and assert:

```ts
expect(routeSource).not.toMatch(/className=["']page-heading/);
expect(routeSource).not.toMatch(/Atomic|RLS protected|Access control|Version control|\bDraft\b/);
expect(routeSource).not.toMatch(/Administration/);
```

Expected: FAIL on Planning, Import, Versions and Admin pages.

- [ ] **Step 2: Replace each legacy header with `PageHeader`**

Example for PO & ETA:

```tsx
<PageHeader
  eyebrow="Lập kế hoạch · Lịch cung ứng"
  title="Đợt PO & ETA"
  description="Theo dõi các đợt mua và thời điểm hàng về cho nhãn hàng đang chọn."
  context={selectedCycle ? <span className="status-badge status-badge--neutral">{selectedCycle.code} · {selectedCycle.planning_year}</span> : null}
/>
```

Vietnamese replacements:

```text
Audit · Version control -> Quản lý phiên bản
Administration · Access control -> Quản trị · Phân quyền truy cập
Atomic · RLS protected -> remove
Draft -> Bản nháp
```

- [ ] **Step 3: Remove the legacy `.page-heading` CSS block**

Delete `.page-heading`, `.page-heading h1` and `.page-heading__copy` after `rg` confirms no consumer remains:

```bash
rg -n "page-heading" src
```

Expected after deletion: no matches.

- [ ] **Step 4: Run route/header verification**

```bash
pnpm vitest run tests/unit/ui/compact-operations-copy.test.ts \
  tests/unit/ui/compact-operations-css.test.ts \
  tests/unit/planning/planning-index-page.test.tsx \
  tests/unit/planning/planning-page-workflow.test.tsx
pnpm lint
pnpm typecheck
git diff --check
```

Expected: all PASS and no `page-heading` usage.

---

### Task 4: Rebuild the Planning master–detail density and overflow behavior

**Files:**
- Create: `src/components/ui/truncated-text.tsx`
- Create: `tests/components/ui/truncated-text.test.tsx`
- Modify: `src/features/planning/components/planning-product-list.tsx`
- Modify: `src/features/planning/components/planning-product-editor.tsx`
- Modify: `src/features/planning/components/planning-workspace.tsx`
- Modify: `src/features/planning/components/planning-header.tsx`
- Modify: `src/features/planning/components/kpi-strip.tsx`
- Modify: `src/features/planning/components/stock-alert.tsx`
- Modify: `src/app/styles/planning.css`
- Modify: `src/app/styles/responsive.css`
- Modify: `tests/components/planning/planning-product-list.test.tsx`
- Modify: `tests/components/planning/planning-product-editor.test.tsx`
- Modify: `tests/components/planning/planning-workspace.test.tsx`

**Produces:** Planning 58/42, SKU không wrap, tên ellipsis có tooltip, editor compact, copy đúng và back button mobile-only.

- [ ] **Step 1: Write failing tooltip accessibility tests**

Required behavior:

```tsx
render(<TruncatedText>Đặc trị nám chuyên sâu dung tích lớn</TruncatedText>);
const trigger = screen.getByText(/Đặc trị nám/);
expect(trigger).toHaveAttribute("tabindex", "0");
await user.hover(trigger);
expect(screen.getByRole("tooltip")).toHaveTextContent("Đặc trị nám chuyên sâu dung tích lớn");
trigger.focus();
expect(screen.getByRole("tooltip")).toBeVisible();
```

Expected: FAIL because component does not exist.

- [ ] **Step 2: Implement `TruncatedText` with hover and focus support**

Use stable `useId()` association:

```tsx
export function TruncatedText({ children, className }: TruncatedTextProps) {
  const tooltipId = useId();
  return (
    <span className={`truncated-text ${className ?? ""}`} tabIndex={0} aria-describedby={tooltipId}>
      <span className="truncated-text__value">{children}</span>
      <span id={tooltipId} role="tooltip" className="truncated-text__tooltip">{children}</span>
    </span>
  );
}
```

CSS shows tooltip on `:hover` and `:focus-visible`; do not rely only on `title`.

- [ ] **Step 3: Write failing Planning layout/copy tests**

Add assertions:

```tsx
expect(screen.getByRole("heading", { name: /Kế hoạch mua hàng ETX · 2026/ })).toBeVisible();
expect(screen.queryByText(/Forecast/)).not.toBeInTheDocument();
expect(screen.getByText("Ngân sách còn lại")).toBeVisible();
expect(screen.queryByRole("button", { name: "Quay lại danh sách" })).not.toBeVisible();
```

For CSS static contract:

```ts
expect(css).toMatch(/grid-template-columns:\s*minmax\([^;]+58fr[^;]+42fr/);
expect(css).toMatch(/planning-product-list__sku[\s\S]*white-space:\s*nowrap/);
expect(css).toMatch(/planning-product-list__name[\s\S]*text-overflow:\s*ellipsis/);
```

Expected: FAIL on legacy title, KPI label and desktop back control.

- [ ] **Step 4: Add explicit table column classes and widths**

Render cells with stable classes:

```tsx
<td className="planning-product-list__sku"><strong>{row.sku}</strong></td>
<td className="planning-product-list__name"><TruncatedText>{row.productName}</TruncatedText></td>
<td className="planning-product-list__number">{formatNumber(row.openingStock)}</td>
```

Use a `<colgroup>` or CSS classes so numeric columns are 86–110px and right-aligned. Keep row keyboard selection and roving tabindex unchanged.

- [ ] **Step 5: Implement the 58/42 workspace and mobile-only back control**

```css
.planning-workspace__detail {
  grid-template-columns: minmax(36rem, 58fr) minmax(24rem, 42fr);
}
.planning-product-editor__back { display: none; }
@media (max-width: 560px) {
  .planning-product-editor__back { display: inline-flex; }
}
```

At intermediate widths where six columns cannot fit, move to one pane or hide lower-priority supporting columns; never wrap SKU.

- [ ] **Step 6: Compact editor fields and localize display formatting**

Keep canonical draft strings raw. Add focus-aware formatting:

```ts
function displayInteger(raw: string, focused: boolean) {
  if (focused || !/^\d+$/.test(raw)) return raw;
  return Number(raw).toLocaleString("vi-VN");
}
```

On focus, show raw digits; on blur, show localized value. Inputs continue sending raw numeric changes to existing `onChange`.

Use a two-column `.planning-product-editor__fields` grid when width permits; Amount spans both columns.

- [ ] **Step 7: Remove repeated shortage copy**

Stock alert target:

```tsx
<h2>{row.sku} cần bổ sung {formatNumber(row.recommendedQty)} sản phẩm</h2>
<p>{row.productName} vẫn active nhưng chưa có PO tương lai đủ đáp ứng kế hoạch.</p>
<button>Tạo đề xuất mua</button>
```

Do not repeat the same quantity in signal, paragraph and CTA.

- [ ] **Step 8: Run full Planning verification**

```bash
pnpm vitest run tests/components/ui/truncated-text.test.tsx \
  tests/components/planning/planning-product-list.test.tsx \
  tests/components/planning/planning-product-editor.test.tsx \
  tests/components/planning/planning-workspace.test.tsx \
  tests/components/planning/autosave-conflict.test.tsx \
  tests/components/approvals/approval-flow.test.tsx \
  tests/unit/planning/planning-page-workflow.test.tsx
pnpm lint
pnpm typecheck
git diff --check
```

Expected: all PASS; autosave/conflict behavior unchanged.

---

### Task 5: Compact Dashboard and PO & ETA

**Files:**
- Modify: `src/features/reports/components/dashboard-kpis.tsx`
- Modify: `src/features/reports/components/po-timeline.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/planning/page.tsx`
- Modify: `src/app/styles/dashboard.css`
- Modify: `src/app/globals.css`
- Modify: `tests/components/reports/dashboard.test.tsx`
- Modify: `tests/unit/planning/planning-index-page.test.tsx`

**Produces:** Dashboard first fold ≤ 280px cho header/context/KPI và PO list không tạo card rỗng quá khổ.

- [ ] **Step 1: Write failing semantic/component tests**

Assert exactly four KPI labels and one occurrence of shortage quantity in the priority alert:

```tsx
expect(screen.getAllByRole("term")).toHaveLength(4);
expect(screen.getByText("Ngân sách còn lại")).toBeVisible();
expect(screen.getAllByText("681.466")).toHaveLength(1);
expect(screen.getByRole("link", { name: "Mở kế hoạch" })).toBeVisible();
```

For timeline, assert a compact list item exposes one accessible name and all key fields without duplicated section title.

- [ ] **Step 2: Add budget utilization context without changing loader contracts**

Calculate from existing values:

```ts
const utilization = target > 0 ? Math.min(100, (committed / target) * 100) : 0;
```

Render supporting text such as `Đã sử dụng 0,4% ngân sách` and a semantic `<progress>` or labelled progress bar.

- [ ] **Step 3: Convert PO timeline to compact rows**

Each item displays:

```text
Tên PO | Trạng thái | Ngày đặt | ETA | Giá trị | Dòng hàng
```

Use a low-height row with responsive wrapping. The page H1 owns `Đợt PO & ETA`; the component heading becomes `Lịch cung ứng` or is visually hidden when context already makes it redundant.

- [ ] **Step 4: Apply density CSS and static height guards**

Targets:

```css
.metric-strip dl > div { min-height: 5.75rem; }
.dashboard-critical { padding: 1rem 1.25rem; }
.po-timeline { padding: 1rem 1.25rem; border-radius: 8px; }
.po-timeline__list article { min-height: 4.5rem; }
```

Add static assertions against returning to 7.5rem KPI or 20px radius.

- [ ] **Step 5: Verify report and planning index surfaces**

```bash
pnpm vitest run tests/components/reports/dashboard.test.tsx \
  tests/unit/planning/planning-index-page.test.tsx \
  tests/components/ui/operations-primitives.test.tsx
pnpm lint
pnpm typecheck
git diff --check
```

Expected: all PASS.

---

### Task 6: Compact Import and Version History

**Files:**
- Modify: `src/features/imports/components/import-workflow.tsx`
- Modify: `src/features/imports/components/import-dropzone.tsx`
- Modify: `src/features/imports/components/import-preview.tsx`
- Modify: `src/features/imports/components/sheet-selector.tsx`
- Modify: `src/features/versions/components/version-history.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/styles/administration.css`
- Modify: `tests/components/imports/import-workflow.test.tsx`
- Modify: `tests/components/versions/version-history.test.tsx`

**Produces:** Import có tiến trình ba bước và dropzone gọn; phiên bản dùng toolbar/table dễ quét.

- [ ] **Step 1: Write failing Import workflow-step tests**

```tsx
expect(screen.getByRole("list", { name: "Tiến trình import" })).toBeVisible();
expect(screen.getByText("Chọn file")).toHaveAttribute("aria-current", "step");
expect(screen.getByText("Kiểm tra")).toBeVisible();
expect(screen.getByText("Xác nhận import")).toBeVisible();
```

After preview resolves, `Kiểm tra` becomes current. Preserve current transport, File identity, sheet selection and retry behavior.

- [ ] **Step 2: Implement a semantic three-step progress indicator**

```tsx
<ol className="import-steps" aria-label="Tiến trình import">
  {steps.map((step) => <li key={step.id} aria-current={step.id === currentStep ? "step" : undefined}>{step.label}</li>)}
</ol>
```

Keep state derived from existing workflow status; do not add a second state machine.

- [ ] **Step 3: Compact the dropzone and source metadata**

CSS target:

```css
.import-dropzone { min-height: 11.25rem; padding: 1.5rem 2rem; }
.import-brand-context { display: inline-flex; align-items: baseline; gap: 0.5rem; }
.import-dropzone h2, .import-preview h2 { font: 700 1.25rem/1.3 var(--sans); }
```

- [ ] **Step 4: Write failing Version History table tests**

```tsx
expect(screen.getByRole("columnheader", { name: "Phiên bản" })).toBeVisible();
expect(screen.getByRole("columnheader", { name: "Nhãn hàng và kế hoạch" })).toBeVisible();
expect(screen.getByRole("link", { name: /Xem phiên bản 1/ })).toBeVisible();
```

Expected: FAIL because current list has no table header or explicit action name.

- [ ] **Step 5: Implement a responsive semantic table/list**

Desktop uses `<table>` with columns from the spec. Mobile uses CSS reflow on the same semantic rows or a separate list only if hidden duplicate content is avoided. Preserve current filters and links.

- [ ] **Step 6: Verify Import and Version surfaces**

```bash
pnpm vitest run tests/components/imports/import-workflow.test.tsx \
  tests/components/versions/version-history.test.tsx \
  tests/unit/imports/http-transport.test.ts \
  tests/unit/imports/preview-route.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: all PASS; no import API/parser changes.

---

### Task 7: Make Approval Policy a real guided accordion

**Files:**
- Modify: `src/features/approvals/components/policy-editor.tsx`
- Modify: `src/features/approvals/components/policy-summary.tsx`
- Modify: `src/features/approvals/domain/policy-summary.ts`
- Modify: `src/app/styles/administration.css`
- Modify: `tests/components/approvals/approval-flow.test.tsx`
- Modify: `tests/unit/approvals/policy-summary.test.ts`

**Produces:** Chỉ bước hiện tại mở, bước hoàn thành thu gọn thật sự, summary compact và copy vai trò tiếng Việt.

- [ ] **Step 1: Write failing accordion behavior tests**

```tsx
expect(screen.getByRole("region", { name: "Áp dụng cho nhãn hàng" })).toBeVisible();
expect(screen.queryByRole("textbox", { name: "Tên chính sách" })).not.toBeVisible();
await user.click(screen.getByLabelText("ETX · Etiaxil"));
await user.click(screen.getByRole("button", { name: "Tiếp tục đến tuyến duyệt" }));
expect(screen.getByRole("textbox", { name: "Tên chính sách" })).toBeVisible();
expect(screen.getByRole("button", { name: "Chỉnh sửa phạm vi" })).toHaveAttribute("aria-expanded", "false");
```

Also assert summary does not visually emphasize `Chưa chọn` values as completed data.

- [ ] **Step 2: Add one canonical `activeSection` state**

```ts
type PolicySection = "scope" | "route" | "exceptions";
const [activeSection, setActiveSection] = useState<PolicySection>("scope");
```

Completion derives from the existing draft. `Chỉnh sửa` sets `activeSection`; next buttons validate only required fields for the current section before advancing. Final submit still runs the existing full validation.

- [ ] **Step 3: Render collapsed summaries instead of leaving forms open**

Use native buttons with `aria-expanded` and labelled regions. Do not use ARIA tabs.

```tsx
<button type="button" aria-expanded={activeSection === "scope"} onClick={() => setActiveSection("scope")}>
  Chỉnh sửa phạm vi
</button>
```

- [ ] **Step 4: Localize role labels in the projection only**

Change display labels:

```ts
firstLevelLabel: "Quản lý nhãn hàng",
secondLevelLabel: isThreshold ? "Ban điều hành khi đạt hạn mức" : "Ban điều hành",
```

Do not rename database roles, enum values or approval routing logic.

- [ ] **Step 5: Compact the summary and save action**

Set summary H2 ≤ 22px, metadata 13–14px and footer height ≤ 64px. Desktop save lives in the summary; mobile uses the existing sticky bar without covering content.

- [ ] **Step 6: Run approval verification**

```bash
pnpm vitest run tests/components/approvals/approval-flow.test.tsx \
  tests/unit/approvals/policy-summary.test.ts \
  tests/unit/approvals/policy-route.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: all PASS; policy API payload unchanged.

---

### Task 8: Compact User Access and finish administration copy

**Files:**
- Modify: `src/features/admin/components/user-access-manager.tsx`
- Modify: `src/app/(app)/admin/users/page.tsx`
- Modify: `src/app/styles/administration.css`
- Modify: `tests/components/admin/user-access-manager.test.tsx`
- Modify: `tests/unit/ui/compact-operations-copy.test.ts`

**Produces:** User list 32/68, role/brand rows compact, Vietnamese role labels, status near identity and sticky save unobtrusive.

- [ ] **Step 1: Write failing user-access presentation tests**

```tsx
expect(screen.getByText("Quản trị hệ thống")).toBeVisible();
expect(screen.getByText("Lập kế hoạch")).toBeVisible();
expect(screen.getByText("Duyệt cấp 1")).toBeVisible();
expect(screen.queryByText("Administrator")).not.toBeInTheDocument();
expect(screen.queryByText("Planner")).not.toBeInTheDocument();
```

Tests must assert submitted enum values remain `administrator`, `planner`, `approver_l1`, `approver_l2`, `viewer`.

- [ ] **Step 2: Separate role code from display metadata**

```ts
const rolePresentation: Record<AppRole, { label: string; description: string }> = {
  administrator: { label: "Quản trị hệ thống", description: "Quản lý người dùng, dữ liệu và chính sách" },
  planner: { label: "Lập kế hoạch", description: "Lập và gửi kế hoạch mua hàng" },
  approver_l1: { label: "Duyệt cấp 1", description: "Duyệt nghiệp vụ" },
  approver_l2: { label: "Duyệt cấp 2", description: "Phê duyệt cuối" },
  viewer: { label: "Chỉ xem", description: "Xem, xuất báo cáo và audit" },
};
```

- [ ] **Step 3: Replace role cards with compact checkbox rows**

Keep labels clickable and accessible. CSS target:

```css
.user-access-layout { grid-template-columns: minmax(17rem, 32fr) minmax(0, 68fr); }
.user-access-options { grid-template-columns: 1fr; }
.user-access-options label { min-height: 3rem; border-radius: 6px; padding: 0.625rem 0.75rem; }
.user-access-editor { gap: 1rem; padding: 1.25rem; }
```

- [ ] **Step 4: Verify canonical override/save reconciliation remains intact**

Run the existing stale-props/canonical-response tests and add one assertion that localized labels do not alter request role values.

```bash
pnpm vitest run tests/components/admin/user-access-manager.test.tsx \
  tests/unit/admin/user-access-route.test.ts \
  tests/unit/ui/compact-operations-copy.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: all PASS.

---

### Task 9: Responsive, accessibility and visual acceptance gate

**Files:**
- Modify: `src/app/styles/responsive.css`
- Modify: `src/app/styles/app-shell.css`
- Modify: `src/app/styles/planning.css`
- Modify: `src/app/styles/dashboard.css`
- Modify: `src/app/styles/administration.css`
- Modify: `tests/unit/ui/responsive-css-boundary.test.ts`
- Create: `tests/e2e/compact-operations-responsive.spec.ts`
- Modify: `tests/e2e/navigation-responsive.spec.ts`

**Consumes:** Tất cả surface từ Task 1–8.
**Produces:** Acceptance ở 1440×900, 1024×768, 390×844; không overflow và đúng giới hạn chữ.

- [ ] **Step 1: Add failing CSS boundary assertions**

Cover:

```ts
expect(allCss).not.toMatch(/font-size:\s*clamp\([^;]*,[^;]*,[^;]*(?:3rem|4rem|7\.8rem)/);
expect(allCss).toMatch(/@media \(max-width: 560px\)[\s\S]*planning-product-editor__back[\s\S]*display:\s*inline-flex/);
expect(allCss).toMatch(/planning-product-editor__back\s*\{[\s\S]*display:\s*none/);
```

Exclude the login editorial surface from the H1 guard because it is outside app shell; make the scan path-specific rather than weakening the rule globally.

- [ ] **Step 2: Add Playwright acceptance checks**

Use existing E2E support/login fixtures. For each viewport:

```ts
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/planning/ETX-2026?brandId=...");
await expect(page.locator("body")).not.toHaveJSProperty("scrollWidth", expect.anything());
```

Use an explicit helper instead of the pseudo assertion above:

```ts
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
}
```

Also assert:

```ts
const h1Size = await page.getByRole("heading", { level: 1 }).evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
expect(h1Size).toBeLessThanOrEqual(40);
await expect(page.getByRole("button", { name: "Quay lại danh sách" })).toBeHidden();
```

At 390px, the back button appears only after selecting a SKU and no whole-page overflow exists.

- [ ] **Step 3: Verify tooltip keyboard behavior in the real layout**

Tab to a truncated product name, assert its tooltip is visible, then Escape or Tab away and assert it closes. Ensure the row selection keyboard behavior still works.

- [ ] **Step 4: Run the complete non-production verification set**

```bash
pnpm test
pnpm test:coverage
pnpm lint
pnpm typecheck
pnpm exec next build --webpack
pnpm check:secrets
git diff --check
pnpm exec playwright test --list
```

Expected: all commands PASS. If local Supabase and allowed ports are available, additionally run:

```bash
E2E_DATABASE_MODE=local pnpm exec playwright test \
  tests/e2e/compact-operations-responsive.spec.ts \
  tests/e2e/navigation-responsive.spec.ts --project=chromium
```

If the local environment cannot bind ports or start Supabase, record the exact environment failure; do not substitute production Supabase.

- [ ] **Step 5: Perform the manual visual checklist on localhost:3001**

At desktop, tablet and mobile verify:

```text
- Header is compact and text is not visually dominant.
- Sidebar label/button never wraps unexpectedly.
- Dashboard context and KPI remain above the first fold.
- Planning SKU does not wrap; long product name truncates with accessible tooltip.
- Desktop back button is hidden; mobile back flow works.
- PO, Import, Version, Policy and User pages do not contain oversized empty cards.
- No technical copy or mixed English role labels remain.
```

Capture screenshots for comparison in a task report under `.superpowers/sdd/2026-08-14-po-forecasting-compact-operations-implementation/`; do not commit or push without separate authorization.

---

## Completion Gate

The implementation is complete only when:

1. All nine tasks have fresh RED/GREEN evidence.
2. `rg -n "page-heading|Atomic|RLS protected|Access control|Version control" src/app src/features` returns no user-facing legacy usage.
3. Planning has no `Forecast` or `Khoảng trống` product copy.
4. Desktop H1 computed size is ≤ 40px and mobile ≤ 32px.
5. No horizontal whole-page overflow exists at 1440×900, 1024×768 and 390×844.
6. Full Vitest, coverage, lint, typecheck, webpack build, secret scan and diff check pass.
7. Relevant Playwright scenarios pass locally, or any infrastructure blocker is recorded accurately without using production as a test substitute.
8. A final read-only code review finds no Critical or Important issue.
