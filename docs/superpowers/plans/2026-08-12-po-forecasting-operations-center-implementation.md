# PO Forecasting Operations Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển ứng dụng PO Forecasting thành trung tâm vận hành mua hàng trực quan, route-aware, master–detail và không còn khóa tên nghiệp vụ hoặc importer vào chuỗi `Forecast 5M`.

**Architecture:** Giữ Next.js App Router và Supabase hiện tại; bổ sung navigation model thuần, các component UI nhỏ theo module, planning master–detail trên cùng state/autosave contract, policy editor theo draft + summary, và pipeline import hai pha detect → select → parse. Mọi quyền, RLS, approval snapshot, checksum và invariant `Amount = Qty × Ex Price` được giữ nguyên.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase/Postgres, ExcelJS, Decimal.js, Vitest + Testing Library, pgTAP, Playwright, CSS thuần theo module.

## Global Constraints

- Nguồn đặc tả đã duyệt: `docs/superpowers/specs/2026-08-12-po-forecasting-ux-redesign-design.md`.
- Trước khi sửa Next.js navigation/CSS, đọc đúng tài liệu bundled của phiên bản đang cài:
  - `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
- Worktree đang có thay đổi chưa commit ở auth, font và import. Không reset, checkout hoặc ghi đè các thay đổi đó; luôn xem `git diff -- <file>` trước khi sửa file đang dirty.
- Không chạy migration, seed, reset, pgTAP hoặc E2E trên Supabase production. Dùng Supabase local/test; production chỉ được cập nhật trong một yêu cầu triển khai riêng có xác nhận rõ.
- Không auto-commit, push, tạo PR hoặc merge. Mỗi checkpoint chỉ ghi nhận evidence; Git lifecycle cần ủy quyền riêng của người dùng.
- Không đổi route công khai nếu chỉ đổi label. Không đổi role/RLS/approval engine/shortage algorithm.
- `Forecast 5M` chỉ được phép xuất hiện trong fixture hoặc metadata tên sheet thực tế. Không dùng làm product copy, tên plan, discriminator hoặc hằng số chọn sheet.
- Mọi số tiền hiển thị từ `planning_cycles.target_purchase_amount` + `currency_code`; `5M` chỉ là một giá trị ngân sách, không phải thời lượng forecast.
- Mọi Amount là read-only và được tính bằng `calculateAmount({ qty, exPrice })`; không nhận Amount do người dùng nhập hoặc Excel tính sai làm nguồn canonical.
- Mỗi task theo RED → GREEN → REFACTOR; chạy test hẹp trước rồi mới suite liên quan.

---

## File Structure Map

### Files to create

- `src/components/navigation/navigation-model.ts` — menu theo quyền, route matching và nhóm module dùng chung desktop/mobile.
- `src/components/navigation/navigation-link.tsx` — link client route-aware với `aria-current`.
- `src/components/navigation/mobile-navigation.tsx` — app header + drawer có focus/keyboard behavior.
- `src/components/ui/page-header.tsx` — header module gọn, breadcrumb/title/actions.
- `src/components/ui/plan-context-bar.tsx` — brand/year/version/status dùng chung.
- `src/components/ui/metric-strip.tsx` — KPI semantic dùng chung Dashboard/Planning.
- `src/features/planning/domain/product-list.ts` — search/filter/sort thuần cho danh sách SKU.
- `src/features/planning/components/planning-product-list.tsx` — master list accessible.
- `src/features/planning/components/planning-product-editor.tsx` — detail editor và validation.
- `src/features/planning/components/planning-workflow-nav.tsx` — bốn bước workflow bằng `<nav>`.
- `src/features/approvals/domain/policy-summary.ts` — project draft thành summary hiển thị.
- `src/features/approvals/components/policy-summary.tsx` — rail/summary phản chiếu draft.
- `src/features/imports/server/detect-forecast-sheet.ts` — structural detection độc lập với tên sheet.
- `src/features/imports/components/sheet-selector.tsx` — lựa chọn khi nhiều sheet phù hợp.
- `src/app/styles/app-shell.css`, `dashboard.css`, `planning.css`, `administration.css`, `responsive.css` — CSS theo module, import từ `globals.css`.
- Test mới tương ứng dưới `tests/unit/**`, `tests/components/**` và fixture workbook đổi tên/nhiều sheet.
- `supabase/migrations/20260812000100_import_source_sheet_metadata.sql` — audit tên sheet nguồn.

### Files to modify

- `src/components/ui/app-sidebar.tsx`, `src/app/(app)/layout.tsx`, `src/app/globals.css`.
- Dashboard: `src/app/(app)/dashboard/page.tsx`, `src/features/reports/components/dashboard-kpis.tsx`, `po-timeline.tsx`, `src/features/reports/server/load-dashboard.ts` nếu projection view cần thêm context đã có sẵn trong DB.
- Planning: `planning-workspace.tsx`, `planning-header.tsx`, `planning-tabs.tsx` (sau đó xóa khi không còn import), `kpi-strip.tsx`, `stock-alert.tsx`, tests hiện có.
- Approval policy: `policy-editor.tsx`, page và tests liên quan.
- Import: `import-types.ts`, `read-workbook.ts`, `build-preview.ts`, preview route, workflow hook/component, dropzone/preview, pgTAP và route/unit tests.
- Copy/layout còn lại: approvals, versions, users pages/components và tests.
- E2E: `tests/e2e/import-plan-approve.spec.ts`, `tests/e2e/support.ts` và test navigation/responsive mới.

### Interfaces and data contracts

```ts
export interface NavigationItem {
  href: string;
  label: string;
  match: "exact" | "prefix";
  permission: "view" | "administer" | "approve";
}

export interface ForecastSheetCandidate {
  sheetName: string;
  headerRow: number;
  score: number;
  missingHeaders: string[];
}

export interface ForecastWorkbookReadResult {
  rows: RawForecastRow[];
  sourceSheetName: string;
}

export interface BuildImportPreviewInput {
  buffer: Buffer | Uint8Array;
  fileName: string;
  sourceSheetName?: string;
  aliases: ReadonlyMap<string, string>;
  knownCanonicalSkus: ReadonlySet<string>;
}

export interface ImportPreview extends ImportValidationResult {
  checksum: string;
  sourceSheetName: string;
  rows: NormalizedImportRow[];
}
```

---

### Task 1: Establish a safe baseline and remove fixed business vocabulary

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-po-forecasting-ux-redesign-design.md`
- Modify: `src/components/ui/app-sidebar.tsx`
- Modify: `src/features/planning/components/planning-header.tsx`
- Modify: `src/app/(app)/planning/page.tsx`
- Modify: `src/app/(app)/imports/page.tsx`
- Modify: `src/features/imports/components/import-dropzone.tsx`
- Test: `tests/components/navigation/app-sidebar.test.tsx`
- Test: `tests/components/planning/planning-workspace.test.tsx`
- Test: `tests/components/imports/import-workflow.test.tsx`

**Produces:** Product copy chuẩn “Kế hoạch mua hàng”, “Dữ liệu nguồn”, “Đợt PO & ETA”, không gắn `5M` vào tên chức năng.

- [ ] **Step 1: Capture dirty-tree and baseline evidence**

Run:

```bash
git status --short
git diff -- src/app/globals.css src/app/layout.tsx \
  src/features/imports/server/read-workbook.ts \
  tests/unit/imports/read-workbook.test.ts
pnpm vitest run tests/components/navigation/app-sidebar.test.tsx \
  tests/components/planning/planning-workspace.test.tsx \
  tests/components/imports/import-workflow.test.tsx
```

Expected: existing focused tests pass. If not, record the pre-existing failure before proceeding; do not mask it with UX changes.

- [ ] **Step 2: Write failing copy tests**

Add assertions similar to:

```ts
expect(screen.getByRole("link", { name: "Kế hoạch mua hàng" })).toBeVisible();
expect(screen.queryByText(/Forecast 5M/i)).not.toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Chọn file kế hoạch để kiểm tra" })).toBeVisible();
```

Run the same focused Vitest command.

Expected: FAIL on current English/fixed copy.

- [ ] **Step 3: Replace product copy without changing routes or data contracts**

Use labels from spec section 11. Preserve “PO Forecasting” only in the Sagen brand lockup. Render plan context from cycle data:

```tsx
<p className="eyebrow">
  {plan.brand.code} · {plan.cycle.planningYear}
</p>
```

Do not concatenate target budget into the plan name.

- [ ] **Step 4: Add a static guard test for forbidden product copy**

Create `tests/unit/ui/product-copy.test.ts` that scans UI source files but excludes import parser diagnostics and fixtures:

```ts
expect(productUiSource).not.toMatch(/Forecast 5M/);
```

Run:

```bash
pnpm vitest run tests/unit/ui/product-copy.test.ts \
  tests/components/navigation/app-sidebar.test.tsx \
  tests/components/planning/planning-workspace.test.tsx \
  tests/components/imports/import-workflow.test.tsx
```

Expected: PASS.

---

### Task 2: Build one route-aware navigation model for desktop and mobile

**Files:**
- Create: `src/components/navigation/navigation-model.ts`
- Create: `src/components/navigation/navigation-link.tsx`
- Create: `src/components/navigation/mobile-navigation.tsx`
- Modify: `src/components/ui/app-sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/styles/app-shell.css`
- Modify: `src/app/globals.css`
- Test: `tests/unit/navigation/navigation-model.test.ts`
- Modify: `tests/components/navigation/app-sidebar.test.tsx`
- Create: `tests/components/navigation/mobile-navigation.test.tsx`

**Consumes:** `CurrentAccess`, `canPerform`, current pathname.
**Produces:** đúng một active item, drawer mobile, cùng permission filtering trên hai bề mặt.

- [ ] **Step 1: Read bundled Next.js navigation/client-component docs listed in Global Constraints**

Record any API nuance relevant to `usePathname`, `<Link>` and client boundaries in task notes.

- [ ] **Step 2: Write failing route-matching unit tests**

Cover exact/prefix and route ownership:

```ts
expect(resolveActiveNavigation("/planning/abc")).toBe("/planning");
expect(resolveActiveNavigation("/versions/abc")).toBe("/versions");
expect(resolveActiveNavigation("/admin/approval-policies")).toBe(
  "/admin/approval-policies",
);
expect(resolveActiveNavigation("/unknown")).toBeNull();
```

Run:

```bash
pnpm vitest run tests/unit/navigation/navigation-model.test.ts
```

Expected: FAIL because model does not exist.

- [ ] **Step 3: Implement the pure navigation model**

Keep permission resolution pure and ordered so only the longest matching route is active:

```ts
export function resolveActiveNavigation(
  pathname: string,
  items = navigationItems,
): string | null {
  return items
    .filter((item) =>
      item.match === "exact"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
```

Groups must be `Lập kế hoạch`, `Dữ liệu`, `Quản trị`; the same array feeds desktop and drawer.

- [ ] **Step 4: Write failing component tests for active state and drawer**

Mock `next/navigation` pathname. Assert exactly one:

```ts
expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
expect(screen.getByRole("link", { name: "Kế hoạch mua hàng" })).toHaveAttribute(
  "aria-current",
  "page",
);
```

Drawer test covers open, Escape close, route click close and focus return to menu button.

- [ ] **Step 5: Implement client links and mobile drawer**

`NavigationLink` owns pathname comparison only; `AppSidebar` still receives authorization-resolved `access`. `MobileNavigation` must use a real button with `aria-expanded`, a labelled dialog/drawer, Escape handling and minimum 44px target.

- [ ] **Step 6: Preserve brand context when switching**

Build the target URL from current module and `brandId`; fallback to `/dashboard` only if module cannot accept brand scope. Add tests for `/planning?brandId=old` → `/planning?brandId=new`.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm vitest run tests/unit/navigation/navigation-model.test.ts \
  tests/components/navigation/app-sidebar.test.tsx \
  tests/components/navigation/mobile-navigation.test.tsx
pnpm lint
pnpm typecheck
```

Expected: PASS, no hydration warnings in browser console.

---

### Task 3: Add shared operations UI primitives and modular CSS

**Files:**
- Create: `src/components/ui/page-header.tsx`
- Create: `src/components/ui/plan-context-bar.tsx`
- Create: `src/components/ui/metric-strip.tsx`
- Create: `src/app/styles/dashboard.css`
- Create: `src/app/styles/planning.css`
- Create: `src/app/styles/administration.css`
- Create: `src/app/styles/responsive.css`
- Modify: `src/app/globals.css`
- Test: `tests/components/ui/operations-primitives.test.tsx`

**Produces:** semantic, compact primitives; CSS no longer grows as one undifferentiated block.

- [ ] **Step 1: Write failing semantic tests**

Assert sequential headings, metric labels/values and accessible context controls. Avoid tests coupled to exact CSS class names.

- [ ] **Step 2: Implement typed primitives**

Example metric contract:

```ts
interface MetricItem {
  label: string;
  value: React.ReactNode;
  supportingText?: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
}
```

Tone supplements text; it never replaces labels.

- [ ] **Step 3: Split new module CSS**

Import at the top of `globals.css`:

```css
@import "./styles/app-shell.css";
@import "./styles/dashboard.css";
@import "./styles/planning.css";
@import "./styles/administration.css";
@import "./styles/responsive.css";
```

Move only rules touched by this redesign. Preserve unrelated dirty font/auth changes. Add shared `:focus-visible`, reduced-motion and 44px mobile control rules.

- [ ] **Step 4: Verify**

Run focused test, `pnpm lint`, `pnpm typecheck`, then `pnpm build` to catch global CSS import ordering errors.

---

### Task 4: Redesign Dashboard around first-viewport decisions

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/features/reports/components/dashboard-kpis.tsx`
- Modify: `src/features/reports/components/po-timeline.tsx`
- Modify: `src/features/reports/server/load-dashboard.ts` only if existing result lacks a required field
- Modify: `tests/components/reports/dashboard.test.tsx`
- Create: `tests/e2e/dashboard-operations.spec.ts`

**Consumes:** existing dashboard projection and selected brand/cycle.
**Produces:** compact header/context, four KPIs, one priority alert, `Đợt PO & ETA`.

- [ ] **Step 1: Write failing component tests for the approved hierarchy**

Assert one H1, four metric labels, one critical action, no `Executive workspace`, no `Khoảng trống`, no repeated shortage count in the CTA.

- [ ] **Step 2: Compose Dashboard with shared primitives**

KPI mapping:

```ts
[
  ["Ngân sách mục tiêu", targetAmount],
  ["Đã lên PO", committedAmount],
  ["Ngân sách còn lại", remainingAmount],
  ["SKU cần xử lý", actionableSkuCount],
]
```

`remainingAmount` uses the domain projection already returned; do not recompute with floating-point arithmetic in JSX.

- [ ] **Step 3: Consolidate priority information**

Render only the highest shortage alert and one `Mở kế hoạch` link preserving brand/cycle query context. Translate PO status labels through one mapping function.

- [ ] **Step 4: Add viewport acceptance test**

At 1366×768, assert the context, four KPI labels and priority CTA are visible without page scroll. Use locator visibility/box assertions rather than screenshot-only evidence.

- [ ] **Step 5: Verify**

Run component test and the new E2E only against isolated local/test Supabase. Do not point Playwright at localhost using production `.env.local` credentials.

---

### Task 5: Implement planning product search, filter and sort as pure domain behavior

**Files:**
- Create: `src/features/planning/domain/product-list.ts`
- Create: `src/features/planning/components/planning-product-list.tsx`
- Test: `tests/unit/planning/product-list.test.ts`
- Test: `tests/components/planning/planning-product-list.test.tsx`

**Consumes:** `PlanningRowView[]`.
**Produces:** stable ordered rows and selected `planLineId`; does not mutate plan rows.

- [ ] **Step 1: Write failing pure-function tests**

Cases: normalized Vietnamese/SKU search, Critical/Warning/Healthy/unresolved filter, shortage descending, SKU ascending, product name ascending, stable tie ordering.

```ts
expect(selectPlanningRows(rows, {
  query: "dac tri xanh",
  severity: "critical",
  sort: "shortage_desc",
})).toEqual([expect.objectContaining({ canonicalSku: "ET-015025" })]);
```

- [ ] **Step 2: Implement immutable selectors**

Use `Intl.Collator("vi", { sensitivity: "base", numeric: true })`; calculate shortage from existing `recommendedQty`, not a second business formula.

- [ ] **Step 3: Write failing list component tests**

Cover keyboard selection, `aria-current`, result count, empty filtered state and `aria-sort`/announced sort state.

- [ ] **Step 4: Implement the master list**

Use semantic list/table appropriate to the final markup; the selected row must be visible by text/icon and `aria-current`, not color alone.

- [ ] **Step 5: Verify focused unit/component tests**

Expected: all pass; no plan state mutation assertion fails.

---

### Task 6: Replace the wide Planning Grid with master–detail editing

**Files:**
- Create: `src/features/planning/components/planning-product-editor.tsx`
- Modify: `src/features/planning/components/planning-workspace.tsx`
- Modify: `src/features/planning/components/planning-header.tsx`
- Modify: `src/features/planning/components/kpi-strip.tsx`
- Modify or remove after references are gone: `src/features/planning/components/planning-grid.tsx`
- Modify: `tests/components/planning/planning-workspace.test.tsx`
- Modify: `tests/components/planning/autosave-conflict.test.tsx`
- Create: `tests/components/planning/planning-product-editor.test.tsx`

**Consumes:** selected `PlanningRowView`, `canEdit`, existing `updateRow`/autosave.
**Produces:** validated Qty/FOC/EX editor, read-only amount, no full-page horizontal grid.

- [ ] **Step 1: Write failing editor tests**

Cover:

```ts
expect(screen.getByLabelText("Thành tiền")).toHaveAttribute("readonly");
await user.clear(screen.getByLabelText("Số lượng đặt"));
await user.type(screen.getByLabelText("Số lượng đặt"), "10");
expect(screen.getByLabelText("Thành tiền")).toHaveValue("42.00");
```

Also reject negative, fractional Qty/FOC and negative EX price; disabled/read-only mode remains legible.

- [ ] **Step 2: Implement controlled detail editor**

Keep calculation at the existing domain boundary:

```ts
const amount = calculateAmount({ qty: draft.qty, exPrice: draft.exPrice });
```

The component emits only `{ qty, focQty, exPrice }`. Never emit imported Amount.

- [ ] **Step 3: Write failing workspace integration tests**

Assert selecting a SKU updates the editor, `Điền đề xuất` fills recommended Qty, changing SKU retains the saved draft, and autosave live text transitions through saving/saved/error/conflict.

- [ ] **Step 4: Refactor `PlanningWorkspace` into master–detail composition**

State ownership:

```ts
const [selectedPlanLineId, setSelectedPlanLineId] = useState(
  initialPlan.rows[0]?.planLineId ?? null,
);
const selectedRow = plan.rows.find(
  (row) => row.planLineId === selectedPlanLineId,
) ?? null;
```

Reuse the existing `updateRow`, `useDraftAutosave` and conflict behavior. Do not introduce a second save path.

- [ ] **Step 5: Handle mobile list → detail**

Use a view-state class/attribute and a back button; preserve filter and scroll. No full-page horizontal overflow at 390px.

- [ ] **Step 6: Verify**

Run all planning component/unit tests, then typecheck. Delete `planning-grid.tsx` only after `rg "PlanningGrid" src tests` returns no live references.

---

### Task 7: Make planning a four-step workflow and gate submission correctly

**Files:**
- Create: `src/features/planning/components/planning-workflow-nav.tsx`
- Modify: `src/features/planning/components/planning-workspace.tsx`
- Modify or remove: `src/features/planning/components/planning-tabs.tsx`
- Modify: `tests/components/planning/planning-workspace.test.tsx`
- Modify: `tests/components/approvals/approval-flow.test.tsx`
- Modify: `tests/e2e/import-plan-approve.spec.ts`

**Produces:** Sản phẩm → Đợt PO & ETA → Ngân sách → Gửi duyệt; preview route vẫn bắt buộc trước confirm.

- [ ] **Step 1: Write failing navigation/CTA tests**

Assert `<nav aria-label="Các bước lập kế hoạch">`, no `role="tab"`, and no `Kiểm tra & gửi duyệt` in Sản phẩm/PO/Ngân sách steps.

- [ ] **Step 2: Implement workflow nav with URL state**

Use a validated query value such as `?step=products|po|budget|submit`; unknown values fall back to `products`. Keep cycle/version/brand query context in links.

- [ ] **Step 3: Move approval toolbar to submit summary only**

The submit step summarizes unresolved critical SKU, budget status and approval route preview. Clicking the CTA calls existing `requestApprovalRoute`; confirming still calls existing idempotent submit path.

- [ ] **Step 4: Preserve dialog accessibility**

Test initial focus, Escape/cancel, focus return and error retention. Do not weaken route preview or approval snapshot behavior.

- [ ] **Step 5: Verify focused component/E2E tests on local/test Supabase**

Expected: proposal edit → budget review → route preview → confirm submission succeeds; CTA cannot be triggered from earlier steps.

---

### Task 8: Refactor approval policy into guided sections with a live summary

**Files:**
- Create: `src/features/approvals/domain/policy-summary.ts`
- Create: `src/features/approvals/components/policy-summary.tsx`
- Modify: `src/features/approvals/components/policy-editor.tsx`
- Modify: `src/app/(app)/admin/approval-policies/page.tsx`
- Create: `tests/unit/approvals/policy-summary.test.ts`
- Modify: `tests/components/approvals/approval-flow.test.tsx`

**Consumes:** one canonical `ApprovalPolicyDraft`.
**Produces:** four guided sections and summary that always mirrors the same draft.

- [ ] **Step 1: Write failing summary projection tests**

Test default fixed two-level and threshold variants, multiple brands, escalation labels and date ranges.

```ts
expect(buildPolicySummary(draft, brands)).toMatchObject({
  modeLabel: "Duyệt 2 cấp bắt buộc",
  brandLabels: ["ETX · Etiaxil"],
});
```

- [ ] **Step 2: Make the editor state canonical**

Replace scattered `mode`/`selectedBrands` state with one draft object. Controlled fields update through one typed helper. Keep default mode `fixed_two_level`.

- [ ] **Step 3: Add guided sections and live summary component**

Sections: Phạm vi → Tuyến duyệt → Ngoại lệ & hiệu lực → Xác nhận. Completed sections expose `Chỉnh sửa`; desktop summary is sticky, mobile summary is in flow with sticky action bar.

- [ ] **Step 4: Add validation behavior tests**

Submit with missing brand/name/date/threshold; expect field error, top error summary and focus on first invalid control. Replace `Điều kiện escalated` with `Điều kiện tăng cấp duyệt`.

- [ ] **Step 5: Verify**

Run policy unit/component/API tests. Confirm payload remains exactly `ApprovalPolicyDraft`; no approval engine or snapshot schema changes.

---

### Task 9: Detect the forecast worksheet by structure, not name

**Files:**
- Create: `src/features/imports/server/detect-forecast-sheet.ts`
- Modify: `src/features/imports/server/read-workbook.ts`
- Modify: `src/features/imports/server/build-preview.ts`
- Modify: `src/features/imports/domain/import-types.ts`
- Modify: `tests/fixtures/forecast-workbook.ts`
- Modify: `tests/unit/imports/read-workbook.test.ts`
- Modify: `tests/unit/imports/build-preview.test.ts`

**Consumes:** loaded ExcelJS workbook and optional explicit sheet name.
**Produces:** candidate diagnostics, selected source sheet name and parsed rows.

- [ ] **Step 1: Add fixtures and failing detector tests**

Fixtures:

1. Current `Forecast 5M` sheet: 13 SKU.
2. Identical structure renamed `Kế hoạch ETX 2026`: 13 SKU.
3. Two structurally valid sheets: returns selection-required candidates.
4. Invalid sheet: reports missing required headers.

The test must prove name independence:

```ts
expect(result.sourceSheetName).toBe("Kế hoạch ETX 2026");
expect(result.rows).toHaveLength(13);
```

- [ ] **Step 2: Implement normalized header scoring**

Scan populated sheets and first 20 rows. Normalize case, whitespace and accents; score required signals (`Code/SKU`, `Product Name`, `Ex Price`, stock, PO Qty/FOC/Amount). Return all candidates above a documented threshold.

Do not use `/4M|5M|10M/` in scoring.

- [ ] **Step 3: Introduce typed selection errors**

```ts
export class ForecastSheetSelectionRequiredError extends Error {
  constructor(readonly candidates: ForecastSheetCandidate[]) {
    super("Có nhiều sheet kế hoạch phù hợp.");
  }
}

export class ForecastSheetNotFoundError extends Error {
  constructor(readonly diagnostics: ForecastSheetCandidate[]) {
    super("Không nhận diện được sheet kế hoạch phù hợp.");
  }
}
```

When explicit `sourceSheetName` is supplied, verify it remains a valid candidate; never parse an arbitrary worksheet by name only.

- [ ] **Step 4: Change parser/build-preview result contracts**

`readForecastWorkbook` returns `{ rows, sourceSheetName }`; `buildImportPreview` includes `sourceSheetName`. Update all consumers and type tests in the same task.

- [ ] **Step 5: Keep compatibility and formula rules**

Continue reading 12 monthly headers from actual source structure. Preserve alias normalization (`ET-015025/026/027` → canonical `ET-015025`) and validate imported Amount against `Qty × Ex Price`; imported Amount remains diagnostic only.

- [ ] **Step 6: Verify**

Run all import unit tests. `rg -n "FORECAST_SHEET|Sheet Forecast 5M" src` must return no business discriminator or fixed error prefix.

---

### Task 10: Add multi-sheet selection UI and retain source sheet audit metadata

**Files:**
- Create: `src/features/imports/components/sheet-selector.tsx`
- Modify: `src/features/imports/hooks/use-import-workflow.ts`
- Modify: `src/features/imports/components/import-workflow.tsx`
- Modify: `src/features/imports/components/import-preview.tsx`
- Modify: `src/app/api/imports/preview/route.ts`
- Create: `supabase/migrations/20260812000100_import_source_sheet_metadata.sql`
- Modify: `supabase/tests/database/import_staging.test.sql`
- Modify: `supabase/tests/database/import_pipeline.test.sql`
- Modify: `tests/unit/imports/preview-route.test.ts`
- Modify: `tests/unit/imports/http-transport.test.ts`
- Modify: `tests/components/imports/import-workflow.test.tsx`

**Consumes:** detector errors/candidates and optional `sourceSheetName`.
**Produces:** safe two-pass preview, staged batch with audited source sheet.

- [ ] **Step 1: Write failing API tests for three outcomes**

- One candidate → 201 preview with `sourceSheetName`.
- Multiple candidates without selection → 409 `sheet_selection_required` with candidate names; no storage upload and no `stage_import_batch` RPC.
- Multiple candidates with a valid explicit selection → 201 and stage exactly that sheet.

- [ ] **Step 2: Extend the transport/workflow state machine**

Contract:

```ts
type ImportWorkflowState =
  | "idle"
  | "uploading"
  | "selecting_sheet"
  | "preview"
  | "committing"
  | "success"
  | "error";

preview(
  file: File,
  brandId: string,
  sourceSheetName?: string,
): Promise<ImportPreviewResponse>;

export class SheetSelectionRequiredError extends Error {
  constructor(readonly candidates: ForecastSheetCandidate[]) {
    super("Hãy chọn sheet kế hoạch cần import.");
  }
}
```

Retain the selected `File` in memory only until preview completes. On candidate selection, resubmit the same file with `sourceSheetName`; do not upload/stage the ambiguous first pass.

- [ ] **Step 3: Implement the selector and preview metadata**

Render radio choices with real source names and diagnostic score; preview displays file, source sheet, brand and detected year. Keyboard selection and error recovery must be tested.

- [ ] **Step 4: Write the local-only migration test first**

Expected pgTAP assertions:

```sql
select has_column('public', 'import_batches', 'source_sheet_name');
select col_not_null('public', 'import_batches', 'source_sheet_name');
```

Update `stage_import_batch` signature to accept `p_source_sheet_name text`, validate non-blank input and write it to `import_batches`. Preserve checksum uniqueness and grants. Migration phải an toàn với batch cũ theo trình tự:

```sql
alter table public.import_batches add column source_sheet_name text;

update public.import_batches
set source_sheet_name = 'Không xác định (legacy)'
where source_sheet_name is null;

alter table public.import_batches
  alter column source_sheet_name set not null,
  add constraint import_batches_source_sheet_name_not_blank
    check (btrim(source_sheet_name) <> '');
```

Không gán default lâu dài: mọi batch mới bắt buộc truyền tên sheet đã nhận diện. Batch legacy phải được phân biệt rõ, không giả tạo tên sheet gốc. `import_batches.source_sheet_name` là audit metadata canonical; nếu snapshot payload được mở rộng trong migration thì chỉ thêm cùng giá trị này, không tạo nguồn dữ liệu thứ hai có thể lệch nhau.

- [ ] **Step 5: Apply and test migration locally only**

Run:

```bash
pnpm supabase start
pnpm supabase db reset --local
pnpm test:db:local
```

Expected: pgTAP passes. Stop if the command resolves to a remote project or asks to link production.

- [ ] **Step 6: Update preview route staging call**

```ts
await supabase.rpc("stage_import_batch", {
  p_brand_id: brandId,
  p_file_name: file.name,
  p_file_size: buffer.byteLength,
  p_storage_path: storagePath,
  p_checksum: preview.checksum,
  p_source_sheet_name: preview.sourceSheetName,
  p_rows: preview.rows,
  p_issues: preview.issues,
});
```

Do not expose filesystem/storage internals in errors. Preserve rollback removal after staging failure.

- [ ] **Step 7: Verify import unit/component/database suites**

No production command. Record the migration as pending production deployment, not applied.

---

### Task 11: Harmonize approval inbox, versions and user access screens

**Files:**
- Modify: relevant components under `src/features/approvals/components/`
- Modify: relevant components under `src/features/versions/`
- Modify: `src/features/admin/components/user-access-manager.tsx`
- Modify: `tests/components/approvals/approval-flow.test.tsx`
- Modify: `tests/components/versions/version-diff.test.tsx`
- Modify: `tests/components/admin/user-access-manager.test.tsx`

**Produces:** consistent master selection, Vietnamese statuses, compact headers and sticky actions.

- [ ] **Step 1: Inventory exact component files and write behavior-first failing tests**

Do not redesign domain behavior. Test active selected item, Vietnamese status, search/filter where specified, and no stale access draft after successful save.

- [ ] **Step 2: Refactor visual hierarchy screen by screen**

- Approvals: stronger selected dossier, current approval level and exception summary.
- Versions: filters for brand/year/status, label `Phiên bản N`.
- Users: search + active status; roles/brands grouped; save action sticky; reconcile local canonical state after API response or `router.refresh()` so saved access is not overwritten by stale props.

- [ ] **Step 3: Verify existing authorization behavior**

Run component and route tests for approvals/users. UI state must not bypass server authorization/RLS.

---

### Task 12: Accessibility, responsive and real-flow acceptance

**Files:**
- Modify: `src/app/styles/responsive.css`
- Modify: affected components from Tasks 2–11
- Create: `tests/e2e/navigation-responsive.spec.ts`
- Modify: `tests/e2e/import-plan-approve.spec.ts`
- Modify: `tests/e2e/support.ts`
- Modify: project documentation with verification evidence

**Produces:** keyboard-complete desktop/mobile flows and fresh local/test evidence.

- [ ] **Step 1: Add automated accessibility-oriented assertions**

At minimum:

- exactly one current nav item;
- drawer Escape/focus return;
- no fake tabs;
- labeled sortable list;
- form errors associated with controls;
- status changes in live regions;
- dialogs labelled and focus-managed.

- [ ] **Step 2: Add viewport tests**

Viewports: 1366×768, 1024×768 and 390×844. Assert no `document.documentElement.scrollWidth > clientWidth`, 44px drawer/actions, mobile list → detail back flow and summary action visibility.

- [ ] **Step 3: Run real E2E on isolated local Supabase**

Use unique year/cycle data via existing local E2E reset support. Log in with seeded roles; exercise Dashboard → Planning list → proposal → budget → approval preview → submit. Assert `/api/e2e/reset` remains unavailable in production mode.

- [ ] **Step 4: Run the full verification ladder**

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm test:db:local
pnpm build
pnpm check:secrets
pnpm verify:production-harness
pnpm e2e:local
```

Expected: every command exits 0. If a service-dependent command cannot run, report it as unverified with exact reason; do not claim completion.

- [ ] **Step 5: Manual visual QA on localhost:3001 using local/test backend**

Check all four reference problem areas, keyboard-only flow, Vietnamese diacritics, focus, empty/loading/error states and responsive layouts. Capture screenshots for review, but treat them as supplementary to behavior assertions.

- [ ] **Step 6: Final guard scans**

```bash
rg -n "Forecast 5M|Executive workspace|Planning Grid|PO Timeline|Version History|Điều kiện escalated" src
rg -n "FORECAST_SHEET|5M.*sheet|sheet.*5M" src/features/imports
git status --short
git diff --check
```

Expected: first two scans return no forbidden product/business coupling; dynamic source sheet display and fixtures may still contain the literal source name. `git diff --check` exits 0.

- [ ] **Step 7: Update documentation and handoff**

Document:

- implemented behavior and routes;
- migration pending/applied status (must still be pending for production unless separately authorized);
- test commands and fresh results;
- known limitations, if any;
- exact list of changed/untracked files.

Do not commit or push without a new explicit Git instruction.

---

## Spec Coverage Matrix

| Acceptance criterion | Primary tasks |
|---|---|
| One active navigation item on every route | 2, 12 |
| No fixed `Forecast 5M` product/business coupling | 1, 9, 10, 12 |
| Current + renamed workbook parse 13 SKU; multi-sheet choice | 9, 10 |
| Dashboard first viewport decisions | 3, 4, 12 |
| Planning search/filter/sort | 5, 6 |
| Master–detail validation and derived Amount | 6 |
| Submit only at final workflow step | 7 |
| Guided policy + live summary | 8 |
| Mobile drawer/no overflow/44px controls | 2, 6, 8, 12 |
| Keyboard-only critical flows | 2, 5–8, 10, 12 |
| Unit/component coverage | 1–11 |
| Real local/test E2E and protected production reset | 4, 7, 12 |

## Execution Checkpoints

After Tasks 1–3: review shell, copy and visual tokens.
After Tasks 4–7: review Dashboard and Planning end-to-end.
After Tasks 8–10: review administration and import contract/migration.
After Tasks 11–12: full visual/accessibility/verification review.

At every checkpoint, show the user the running app on `http://localhost:3001` only if it is configured against the intended local/test environment. Never silently reuse production credentials for destructive or reset-enabled tests.
