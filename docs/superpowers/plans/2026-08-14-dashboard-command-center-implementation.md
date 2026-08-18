# Dashboard Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sparse dashboard with a decision-oriented command center that explains stock risk, budget health, supply progress, data freshness, and the next action within three seconds.

**Architecture:** Keep all data access in the existing server loader, derive a typed dashboard insight view with pure functions, and render it through small semantic React components. Preserve the existing Supabase/RLS scope and add only a read-only `lineId` URL parameter for direct product drill-down in Planning.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase SSR, vanilla CSS modules imported through `globals.css`, Vitest, Testing Library.

## Global Constraints

- Do not change Supabase schema, RLS, approval engine, import pipeline, Amount calculation, or role permissions.
- Use official Sagen emerald/lime identity and existing Vietnamese UI terminology.
- Do not add chart libraries, fabricated trends, or comparisons without historical data.
- Desktop block spacing is 24px; health-card spacing is 16px; mobile spacing is at least 16px.
- No horizontal page overflow at 1280×800, 1024×768, or 390×844.
- All state has a text label; touch targets are at least 44px on mobile; focus remains visible.
- Do not commit, push, create a PR, or mutate production data during this implementation.

---

### Task 1: Typed dashboard insight model

**Files:**
- Create: `src/features/reports/domain/dashboard-insights.ts`
- Modify: `src/features/reports/report-types.ts`
- Modify: `src/features/reports/server/load-dashboard.ts`
- Create: `tests/unit/reports/dashboard-insights.test.ts`

**Interfaces:**
- Produces `DashboardInsightView`, `DashboardPriorityItem`, `DashboardBatchStatusCounts` in `report-types.ts`.
- Produces `buildDashboardInsights(rows, batches, kpis): DashboardInsightView`.
- `DashboardView` gains required property `insights: DashboardInsightView`.

- [ ] **Step 1: Write failing tests for derived decision data**

Cover severity-first sorting, top-five limit, total recommended quantity, status counts, nearest ETA, utilization over 100%, and zero target:

```ts
const insights = buildDashboardInsights(rows, batches, {
  targetAmount: 100,
  committedAmount: 125,
  gapAmount: -25,
  criticalCount: 2,
  actionableSkuCount: 6,
  poCount: 4,
});

expect(insights.topPriorityRows).toHaveLength(5);
expect(insights.topPriorityRows[0]?.sku).toBe("ET-CRITICAL");
expect(insights.totalRecommendedQty).toBe(900);
expect(insights.budgetUtilization).toBe(125);
expect(insights.nextEtaDate).toBe("2026-08-20");
expect(insights.batchStatusCounts.planned).toBe(1);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/unit/reports/dashboard-insights.test.ts`
Expected: FAIL because the domain module and insight types do not exist.

- [ ] **Step 3: Implement the pure insight builder**

Use severity rank `critical: 0`, `warning: 1`, `healthy: 2`; filter `recommendedQty > 0`; sort without mutating input; slice five. Initialize all four active status counts to zero and ignore cancelled batches for active counts and nearest ETA.

```ts
export function buildDashboardInsights(
  rows: readonly PlanningRowView[],
  batches: readonly PoTimelineItem[],
  kpis: DashboardKpiView,
): DashboardInsightView {
  const actionable = rows
    .filter((row) => row.recommendedQty > 0)
    .toSorted((a, b) => severityRank[a.severity] - severityRank[b.severity]
      || b.recommendedQty - a.recommendedQty);
  const activeBatches = batches.filter((batch) => batch.status !== "cancelled");

  return {
    totalRecommendedQty: actionable.reduce((sum, row) => sum + row.recommendedQty, 0),
    topPriorityRows: actionable.slice(0, 5).map(toPriorityItem),
    batchStatusCounts: countBatchStatuses(activeBatches),
    nextEtaDate: activeBatches.map((batch) => batch.etaDate).sort()[0] ?? null,
    budgetUtilization: kpis.targetAmount > 0
      ? (kpis.committedAmount / kpis.targetAmount) * 100
      : 0,
  };
}
```

- [ ] **Step 4: Wire insights into `loadDashboard`**

Build `kpis` once, call `buildDashboardInsights(plan.rows, timeline, kpis)`, and return `{ plan, batches: timeline, kpis, insights }`.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm vitest run tests/unit/reports/dashboard-insights.test.ts && pnpm typecheck`
Expected: PASS.

### Task 2: Executive summary and three health cards

**Files:**
- Create: `src/features/reports/components/dashboard-executive-summary.tsx`
- Create: `src/features/reports/components/dashboard-health-cards.tsx`
- Modify: `tests/components/reports/dashboard.test.tsx`

**Interfaces:**
- `DashboardExecutiveSummary` consumes `plan`, `kpis`, `insights`, and `planningHref`.
- `DashboardHealthCards` consumes `currencyCode`, `kpis`, and `insights`.

- [ ] **Step 1: Replace the old KPI assertions with failing command-center assertions**

Add cases for summary precedence and three-card semantics:

```tsx
expect(screen.getByRole("region", { name: "Tóm tắt điều hành" })).toHaveTextContent(
  "Ngân sách đã vượt",
);
expect(screen.getByRole("region", { name: "Sức khỏe kế hoạch" })).toHaveTextContent(
  "Hàng hóa",
);
expect(screen.getAllByTestId("dashboard-health-card")).toHaveLength(3);
expect(screen.getByText("Cập nhật 11:07 14/08/2026")).toBeVisible();
```

Test state priority in this order: over budget, actionable shortages, no active batches, ready. Test target zero copy `Chưa thiết lập ngân sách mục tiêu`.

- [ ] **Step 2: Run component tests and verify RED**

Run: `pnpm vitest run tests/components/reports/dashboard.test.tsx`
Expected: FAIL because the new components are missing.

- [ ] **Step 3: Implement `DashboardExecutiveSummary`**

Use a pure local resolver returning `{ tone, eyebrow, title, description }`. Format `plan.version.updatedAt` in `Asia/Ho_Chi_Minh`. Keep one primary link named `Mở kế hoạch mua hàng`; never repeat shortage quantity in the CTA.

- [ ] **Step 4: Implement `DashboardHealthCards`**

Render a semantic section and three `<article data-testid="dashboard-health-card">` elements:

- Hàng hóa: actionable SKU count, critical count, total quantity, top SKU.
- Ngân sách: remaining/over amount, committed/target, progress.
- Cung ứng: active batch count, four status labels, nearest ETA or empty copy.

Progress uses `value={Math.min(100, Math.max(0, insights.budgetUtilization))}` while visible text uses the real percentage.

- [ ] **Step 5: Run component tests**

Run: `pnpm vitest run tests/components/reports/dashboard.test.tsx`
Expected: PASS for summary and health cards.

### Task 3: Priority and supply decision panels

**Files:**
- Create: `src/features/reports/components/dashboard-priority-list.tsx`
- Create: `src/features/reports/components/dashboard-supply-preview.tsx`
- Create: `src/features/reports/components/dashboard-workflow-status.tsx`
- Modify: `tests/components/reports/dashboard.test.tsx`

**Interfaces:**
- `DashboardPriorityList({ rows, planningHref })` appends encoded `lineId` to the existing scoped URL.
- `DashboardSupplyPreview({ batches, currencyCode, supplyHref, planningHref })` shows at most three rows.
- `DashboardWorkflowStatus({ version })` maps every `PlanStatus` to a Vietnamese next-step message.

- [ ] **Step 1: Write failing tests for lists, limits, empty states, and workflow copy**

```tsx
expect(screen.getAllByRole("link", { name: "Xử lý" })).toHaveLength(5);
expect(screen.getAllByRole("link", { name: "Xử lý" })[0]).toHaveAttribute(
  "href",
  expect.stringContaining("lineId=critical-line"),
);
expect(screen.getAllByRole("article", { name: /Đợt mua/ })).toHaveLength(3);
expect(screen.getByText("Tiếp tục hoàn thiện kế hoạch trước khi gửi duyệt.")).toBeVisible();
```

Also test no-priority and no-batch states and ensure more than five/three input items are truncated.

- [ ] **Step 2: Run component tests and verify RED**

Run: `pnpm vitest run tests/components/reports/dashboard.test.tsx`
Expected: FAIL because the three panels do not exist.

- [ ] **Step 3: Implement the priority list**

Use `<ol>` and one row per item. Render `TruncatedText` for product names. Build href with `&lineId=${encodeURIComponent(row.planLineId)}` because `planningHref` already contains scoped query parameters.

- [ ] **Step 4: Implement the supply preview**

Reuse `getPurchaseBatchStatusLabel`; sort by `etaDate`, slice three, format dates and money, and expose links `Xem toàn bộ lịch cung ứng` and `Lập đợt mua` only in their relevant states.

- [ ] **Step 5: Implement workflow status**

Map all statuses explicitly:

```ts
const nextStepByStatus: Record<PlanStatus, string> = {
  draft: "Tiếp tục hoàn thiện kế hoạch trước khi gửi duyệt.",
  submitted: "Hồ sơ đã gửi và đang chờ tiếp nhận.",
  review_l1: "Hồ sơ đang chờ duyệt cấp 1.",
  review_l2: "Hồ sơ đang chờ duyệt cấp 2.",
  approved: "Kế hoạch đã duyệt; tiếp tục theo dõi lịch cung ứng.",
  changes_requested: "Cần chỉnh sửa hồ sơ trước khi gửi lại.",
  superseded: "Phiên bản này đã được thay thế.",
};
```

- [ ] **Step 6: Run component tests**

Run: `pnpm vitest run tests/components/reports/dashboard.test.tsx`
Expected: PASS.

### Task 4: Dashboard page composition and direct SKU drill-down

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/planning/[cycleId]/page.tsx`
- Modify: `src/features/planning/components/planning-workspace.tsx`
- Modify: `tests/components/reports/dashboard.test.tsx`
- Modify: `tests/unit/planning/planning-page-workflow.test.tsx`
- Modify: `tests/components/planning/planning-workspace.test.tsx`

**Interfaces:**
- Planning page accepts `lineId?: string | string[]`.
- `PlanningWorkspaceProps` gains `initialSelectedPlanLineId?: string | null`.
- Invalid or unauthorized line IDs fall back to the first visible plan row.

- [ ] **Step 1: Write failing page composition and drill-down tests**

Assert the Dashboard no longer renders `DashboardKpis`, `dashboard-critical`, or full `PoTimeline`; it renders all five new sections and scoped URLs. Assert Planning passes a valid requested `lineId` and ignores an ID not present in `plan.rows`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/components/reports/dashboard.test.tsx tests/unit/planning/planning-page-workflow.test.tsx tests/components/planning/planning-workspace.test.tsx`
Expected: FAIL on missing `lineId` behavior and old dashboard structure.

- [ ] **Step 3: Compose the Dashboard page**

Build both scoped URLs:

```ts
const planningHref = `/planning/${encodeURIComponent(code)}?brandId=${encodeURIComponent(activeBrandId)}&cycleId=${encodeURIComponent(cycleId)}`;
const supplyHref = `${planningHref}&step=po`;
```

Render context bar, executive summary, health cards, decision grid, and workflow status. Keep export as the header secondary action.

- [ ] **Step 4: Implement Planning `lineId` selection**

Resolve the scalar query value in the server page and pass it to `PlanningWorkspace`. Initialize selected state only when `initialPlan.rows.some(row => row.planLineId === initialSelectedPlanLineId)`; use detail mobile mode for a valid direct link.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm vitest run tests/components/reports/dashboard.test.tsx tests/unit/planning/planning-page-workflow.test.tsx tests/components/planning/planning-workspace.test.tsx && pnpm typecheck`
Expected: PASS.

### Task 5: Spacing, responsive layout, and visual contract

**Files:**
- Modify: `src/app/styles/dashboard.css`
- Modify: `src/app/styles/responsive.css`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/ui/compact-operations-css.test.ts`
- Modify: `tests/unit/ui/responsive-css-boundary.test.ts`
- Create: `tests/unit/ui/dashboard-command-center-css.test.ts`

**Interfaces:**
- All `.dashboard-*` and `.po-timeline*` layout rules live in `dashboard.css`; remove their legacy copies from `globals.css`.

- [ ] **Step 1: Write failing CSS contract tests**

Assert:

```ts
expect(dashboardCss).toMatch(/\.dashboard-page\s*\{[\s\S]*display:\s*grid[\s\S]*gap:\s*1\.5rem/);
expect(dashboardCss).toMatch(/\.dashboard-health-grid\s*\{[\s\S]*gap:\s*1rem/);
expect(dashboardCss).toMatch(/\.dashboard-decision-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*3fr\)\s+minmax\(18rem,\s*2fr\)[\s\S]*gap:\s*1\.5rem/);
expect(globalsCss).not.toMatch(/\.dashboard-critical|\.dashboard-kpi|\.po-timeline\s*\{/);
```

Include tablet/mobile one-column rules and 44px action targets.

- [ ] **Step 2: Run CSS tests and verify RED**

Run: `pnpm vitest run tests/unit/ui/dashboard-command-center-css.test.ts tests/unit/ui/compact-operations-css.test.ts tests/unit/ui/responsive-css-boundary.test.ts`
Expected: FAIL because old dashboard rules remain in `globals.css` and the new layout classes do not exist.

- [ ] **Step 3: Implement dashboard visual system**

Use explicit 24px page gaps, 16px health gaps, independent 12px radius cards, subtle shadow, no touching borders, and a 60/40 decision grid. Keep green for brand/positive, amber for attention, red for critical, neutral slate for information.

- [ ] **Step 4: Move legacy timeline styles**

Move the complete `.po-timeline*` and `.po-status*` rules from `globals.css` into `dashboard.css` without changing the Planning PO screen behavior. Remove unused `.dashboard-kpis`, `.dashboard-kpi*`, `.dashboard-filters`, and `.dashboard-critical` rules.

- [ ] **Step 5: Run UI and affected component tests**

Run: `pnpm vitest run tests/unit/ui tests/components/reports/dashboard.test.tsx tests/components/planning/planning-workspace.test.tsx`
Expected: PASS.

### Task 6: Browser validation and full verification

**Files:**
- Modify only if a regression is found: files already listed above.

**Interfaces:**
- No new interfaces; this task validates the complete user journey.

- [ ] **Step 1: Validate real localhost data visually**

Open the authenticated Dashboard on `http://localhost:3001`. Verify summary accuracy, three health cards, top-five order, supply preview, data timestamp, and no touching card borders.

- [ ] **Step 2: Validate responsive breakpoints**

At 1280×800, 1024×768, and 390×844, assert `document.documentElement.scrollWidth <= window.innerWidth`, all Sagen images have `naturalWidth > 0`, and primary links remain keyboard reachable.

- [ ] **Step 3: Validate drill-down**

Click the first `Xử lý` link. Verify Planning opens the matching SKU and the URL preserves `brandId`, `cycleId`, and `lineId`.

- [ ] **Step 4: Run fresh automated verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check:secrets
git diff --check
pnpm exec next build --webpack
```

Expected: all commands exit 0. If the production build conflicts with an active dev-server lock, stop only the project dev server after preserving its command, build, then restart it on port 3001 and verify HTTP 200.

- [ ] **Step 5: Update plan status and hand off**

Report the exact test counts, build result, responsive viewports, and localhost URL. State explicitly that no commit/push or production-data mutation was performed.
