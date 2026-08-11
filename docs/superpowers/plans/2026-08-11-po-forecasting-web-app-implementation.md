# Sagen PO Forecasting Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng MVP web app nội bộ thay thế sheet `Forecast 5M`, sử dụng Next.js trên localhost và Supabase cho Auth, PostgreSQL, RLS và Storage.

**Architecture:** Một modular monolith Next.js App Router chia theo feature. Domain calculations có module TypeScript thuần để kiểm thử nhanh; database constraints và RPC bảo vệ invariant, transaction và approval state machine; UI truy cập Supabase bằng session người dùng và RLS.

**Tech Stack:** Node.js 22, pnpm, Next.js App Router, React, TypeScript, Tailwind CSS, Supabase, PostgreSQL, `@supabase/ssr`, TanStack Table, TanStack Query, Zod, Decimal.js, ExcelJS, Vitest, Testing Library, fast-check và Playwright.

## Global Constraints

- Node.js 22; package versions được khóa bằng `pnpm-lock.yaml` tại thời điểm scaffold.
- Giao diện và thông báo nghiệp vụ dùng tiếng Việt; timezone `Asia/Ho_Chi_Minh`; tiền tệ mặc định EUR.
- Desktop-first, hoạt động từ 1366×768 trở lên và không dùng màu làm tín hiệu duy nhất.
- `Amount = Qty × Ex Price`; FOC tăng tồn kho nhưng không tăng Amount.
- ET-015025 là canonical SKU cho ET-015025, ET-015026 và ET-015027.
- ET-015150 active; không có PO tương lai phải cảnh báo thiếu 2.368 sản phẩm.
- Default approval policy là fixed two-level.
- Version đã Submit hoặc Approved là bất biến; thay đổi qua revision mới.
- Tất cả bảng exposed bật RLS và mặc định deny; quyền bị giới hạn theo role và brand.
- Không commit workbook thật, database password, connection string, service-role key hoặc `.env.local`.
- Runtime web ưu tiên Supabase Data API/RPC; raw database connection chỉ dùng cho migration hoặc tác vụ server được phê duyệt.
- Mọi behavior mới đi theo RED → GREEN → REFACTOR và có fresh verification trước khi commit.

---

## Planned File Structure

```text
src/
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx
    (app)/dashboard/page.tsx
    (app)/planning/[cycleId]/page.tsx
    (app)/imports/page.tsx
    (app)/approvals/page.tsx
    (app)/versions/[versionId]/page.tsx
    (app)/admin/users/page.tsx
    (app)/admin/approval-policies/page.tsx
    api/imports/preview/route.ts
    api/imports/commit/route.ts
    auth/callback/route.ts
  components/ui/
  features/
    auth/
    master-data/
    imports/
    planning/
    approvals/
    versions/
    reports/
  lib/
    domain/
    supabase/
    validation/
  proxy.ts
supabase/
  config.toml
  migrations/
  seed.sql
  tests/database/
tests/
  unit/
  components/
  e2e/
docs/superpowers/specs/
docs/superpowers/plans/
```

## Shared Domain Interfaces

Các task bên dưới sử dụng thống nhất các interface sau trong `src/lib/domain/types.ts`:

```ts
export type PlanStatus =
  | "draft"
  | "submitted"
  | "review_l1"
  | "review_l2"
  | "approved"
  | "changes_requested"
  | "superseded";

export type ApprovalMode = "fixed_two_level" | "threshold";

export interface MoneyInput {
  qty: number;
  exPrice: string;
}

export interface MonthlyStockInput {
  openingStock: number;
  demand: number;
  qty: number;
  focQty: number;
  isCancelled: boolean;
}

export interface ApprovalRouteInput {
  mode: ApprovalMode;
  amount: string;
  threshold: string | null;
  hasEscalationException: boolean;
}

export interface ApprovalRoute {
  levels: 1 | 2;
  reason: "fixed" | "under_threshold" | "threshold_met" | "exception";
}
```

---

### Task 1: Repository, Next.js và Supabase Local Baseline

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/proxy.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `src/app/globals.css`
- Create: `.env.example`
- Create: `supabase/config.toml`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Modify: `.gitignore`
- Test: `tests/unit/environment.test.ts`

**Interfaces:**
- Consumes: Supabase project URL và publishable key qua environment variables.
- Produces: `createBrowserSupabaseClient()`, `createServerSupabaseClient()` và session refresh proxy.

- [x] **Step 1: Scaffold Next.js thủ công tại root và cài dependency**

```bash
corepack enable
pnpm init
pnpm add next@latest react@latest react-dom@latest @supabase/ssr @supabase/supabase-js @tanstack/react-query @tanstack/react-table decimal.js exceljs zod
pnpm add -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss eslint eslint-config-next supabase vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom fast-check @playwright/test
pnpm pkg set scripts.dev="next dev" scripts.build="next build" scripts.start="next start" scripts.lint="eslint" scripts.test="vitest run" scripts.e2e="playwright test"
pnpm exec supabase init
```

Do not run `create-next-app .`: the repository root already contains the approved docs and private workbook. Create the listed config and `src/app` files with `apply_patch`, matching the current Next.js TypeScript/App Router defaults.

- [x] **Step 2: Write the failing environment contract test**

```ts
import { describe, expect, it } from "vitest";
import { envSchema } from "@/lib/validation/env";

describe("envSchema", () => {
  it("rejects a missing Supabase publishable key", () => {
    const result = envSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });
    expect(result.success).toBe(false);
  });
});
```

- [x] **Step 3: Run the test and verify RED**

Run: `pnpm vitest run tests/unit/environment.test.ts`
Expected: FAIL because `@/lib/validation/env` does not exist.

- [x] **Step 4: Implement environment and Supabase clients**

```ts
// src/lib/validation/env.ts
import { z } from "zod";

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});
```

`.env.example` must contain only:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-with-publishable-key
```

- [x] **Step 5: Verify baseline**

Run: `pnpm vitest run tests/unit/environment.test.ts && pnpm lint && pnpm build`
Expected: PASS; build must not require a database password.

- [x] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs src supabase/config.toml vitest.config.ts playwright.config.ts .env.example .gitignore tests/unit/environment.test.ts
git commit -m "chore: scaffold Next.js and Supabase baseline"
```

---

### Task 2: Domain Calculations và SKU Canonicalization

**Files:**
- Create: `src/lib/domain/types.ts`
- Create: `src/lib/domain/money.ts`
- Create: `src/lib/domain/stock.ts`
- Create: `src/lib/domain/sku.ts`
- Test: `tests/unit/domain/money.test.ts`
- Test: `tests/unit/domain/stock.test.ts`
- Test: `tests/unit/domain/sku.test.ts`
- Test: `tests/unit/domain/domain-properties.test.ts`

**Interfaces:**
- Consumes: `MoneyInput`, `MonthlyStockInput`.
- Produces: `calculateAmount(input): string`, `calculateClosingStock(input): number`, `calculateShortage(projectedStock, targetStock): number`, `canonicalizeSku(rawSku, aliases): string`.

- [x] **Step 1: Write failing example tests**

```ts
expect(calculateAmount({ qty: 2368, exPrice: "12.50" })).toBe("29600.00");
expect(calculateClosingStock({ openingStock: 32, demand: 2400, qty: 0, focQty: 0, isCancelled: false })).toBe(-2368);
expect(calculateShortage(-2368, 0)).toBe(2368);
expect(canonicalizeSku("ET-015027", new Map([["ET-015027", "ET-015025"]]))).toBe("ET-015025");
```

- [x] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/domain`
Expected: FAIL with missing domain modules.

- [x] **Step 3: Implement pure functions**

```ts
import Decimal from "decimal.js";

export function calculateAmount({ qty, exPrice }: MoneyInput): string {
  return new Decimal(qty).mul(new Decimal(exPrice)).toFixed(2);
}

export function calculateClosingStock(input: MonthlyStockInput): number {
  const receipt = input.isCancelled ? 0 : input.qty + input.focQty;
  return input.openingStock + receipt - input.demand;
}

export function calculateShortage(projectedStock: number, targetStock: number): number {
  return Math.max(0, targetStock - projectedStock);
}

export function canonicalizeSku(rawSku: string, aliases: ReadonlyMap<string, string>): string {
  const normalized = rawSku.trim().toUpperCase();
  return aliases.get(normalized) ?? normalized;
}
```

- [x] **Step 4: Add property tests**

```ts
fc.assert(fc.property(fc.nat(), fc.nat(), fc.nat(), (opening, receipt, demand) => {
  const closing = calculateClosingStock({ openingStock: opening, demand, qty: receipt, focQty: 0, isCancelled: false });
  return closing === opening + receipt - demand;
}));
```

- [x] **Step 5: Verify GREEN and commit**

Run: `pnpm vitest run tests/unit/domain --coverage`
Expected: PASS, including ET-015150 regression.

```bash
git add src/lib/domain tests/unit/domain
git commit -m "feat: add forecast domain calculations"
```

---

### Task 3: Auth, RBAC, Brands và SKU Master Database

**Files:**
- Create: `supabase/migrations/20260811000100_identity_and_master_data.sql`
- Create: `supabase/seed.sql`
- Test: `supabase/tests/database/identity_and_master_data.test.sql`
- Create: `src/features/auth/permissions.ts`
- Test: `tests/unit/auth/permissions.test.ts`

**Interfaces:**
- Consumes: Supabase Auth `auth.uid()`.
- Produces: tables `profiles`, `roles`, `user_roles`, `user_brand_access`, `brands`, `products`, `sku_aliases`; function `canAccessBrand(userId, brandId, action)`.

- [x] **Step 1: Write failing database tests**

```sql
select plan(4);
select has_table('public', 'brands', 'brands exists');
select has_table('public', 'sku_aliases', 'sku aliases exists');
select col_is_unique('public', 'sku_aliases', 'alias_sku', 'alias is unique');
select policies_are('public', 'brands', array['brands_select_by_access'], 'brand RLS policy exists');
select * from finish();
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm supabase db reset && pnpm supabase test db`
Expected: FAIL because tables and policies do not exist.

- [x] **Step 3: Implement schema and RLS**

```sql
create type public.app_role as enum ('administrator','planner','approver_l1','approver_l2','viewer');

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  canonical_sku text not null unique,
  name text not null,
  is_active boolean not null default true
);

create table public.sku_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  alias_sku text not null unique,
  valid_from date not null default current_date,
  valid_to date,
  check (valid_to is null or valid_to >= valid_from)
);
```

Add explicit grants, enable RLS on every table, and create policies that require membership in `user_brand_access`. Seed ETX and the three aliases mapping to ET-015025.

- [x] **Step 4: Implement UI permission helper and tests**

```ts
export function canPerform(roleSet: ReadonlySet<AppRole>, action: AppAction): boolean {
  if (roleSet.has("administrator")) return true;
  const matrix: Record<AppAction, AppRole[]> = {
    view: ["planner", "approver_l1", "approver_l2", "viewer"],
    edit_plan: ["planner"],
    approve_l1: ["approver_l1"],
    approve_l2: ["approver_l2"],
    administer: [],
  };
  return matrix[action].some((role) => roleSet.has(role));
}
```

- [x] **Step 5: Verify and commit**

Run: `pnpm supabase db reset && pnpm supabase test db && pnpm vitest run tests/unit/auth`
Expected: PASS; a user without brand membership cannot select the brand.

```bash
git add supabase src/features/auth tests/unit/auth
git commit -m "feat: add brand-scoped RBAC and SKU master"
```

---

### Task 4: Planning, Dynamic PO và Database Invariants

**Files:**
- Create: `supabase/migrations/20260811000200_planning_and_purchase_orders.sql`
- Test: `supabase/tests/database/planning_and_purchase_orders.test.sql`
- Create: `src/features/planning/contracts.ts`

**Interfaces:**
- Consumes: brand/product master.
- Produces: `planning_cycles`, `plan_versions`, `plan_lines`, `plan_monthly_demand`, `purchase_batches`, `purchase_lines`; generated `amount`; plan status constraints.

- [x] **Step 1: Write failing invariant tests**

```sql
select plan(3);
select has_table('public', 'purchase_batches', 'dynamic purchase batches exist');
select has_column('public', 'purchase_lines', 'amount', 'amount exists');
select col_is_generated('public', 'purchase_lines', 'amount', 'amount is database-generated');
select * from finish();
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm supabase test db`
Expected: FAIL because planning tables do not exist.

- [x] **Step 3: Implement core tables**

```sql
create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_batch_id uuid not null references public.purchase_batches(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty integer not null check (qty >= 0),
  foc_qty integer not null default 0 check (foc_qty >= 0),
  ex_price numeric(18,6) not null check (ex_price >= 0),
  amount numeric(20,2) generated always as (round(qty * ex_price, 2)) stored,
  unique (purchase_batch_id, product_id)
);
```

`purchase_batches` must store `order_date`, `eta_date`, `status`, `currency_code` and `plan_version_id`. `plan_versions` must store `status`, `version_number`, `parent_version_id`, `lock_version` and source snapshot reference.

- [x] **Step 4: Add grants, RLS and immutable-status trigger**

The trigger must reject UPDATE/DELETE on `plan_versions` with status `submitted`, `review_l1`, `review_l2`, `approved` or `superseded`, except through guarded RPC functions introduced in later tasks.

- [x] **Step 5: Verify and commit**

Run: `pnpm supabase db reset && pnpm supabase test db`
Expected: PASS; inserting `qty=10, ex_price=12.5` yields `amount=125.00`.

```bash
git add supabase/migrations/20260811000200_planning_and_purchase_orders.sql supabase/tests/database/planning_and_purchase_orders.test.sql src/features/planning/contracts.ts
git commit -m "feat: add versioned plans and dynamic PO schema"
```

---

### Task 5: Excel Import Preview, Validation và Atomic Commit

**Files:**
- Create: `src/features/imports/domain/import-types.ts`
- Create: `src/features/imports/server/read-workbook.ts`
- Create: `src/features/imports/server/normalize-rows.ts`
- Create: `src/features/imports/server/validate-import.ts`
- Create: `src/app/api/imports/preview/route.ts`
- Create: `src/app/api/imports/commit/route.ts`
- Create: `supabase/migrations/20260811000300_import_pipeline.sql`
- Test: `tests/unit/imports/read-workbook.test.ts`
- Test: `tests/unit/imports/normalize-rows.test.ts`
- Test: `supabase/tests/database/import_pipeline.test.sql`
- Create: `tests/fixtures/forecast-import.synthetic.xlsx`

**Interfaces:**
- Consumes: `.xlsx` buffer, canonical SKU map, authenticated Administrator.
- Produces: `ImportPreview`, `ImportIssue[]`, RPC `commit_import_batch(p_batch_id uuid, p_idempotency_key uuid)`.

- [x] **Step 1: Write failing parser and normalization tests**

```ts
const rows = await readForecastWorkbook(fixtureBuffer);
expect(rows).toContainEqual(expect.objectContaining({ rawSku: "ET-015150", currentStock: 32 }));
expect(normalizeRows(rows, aliasMap).find((row) => row.rawSku === "ET-015027")?.canonicalSku).toBe("ET-015025");
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/unit/imports`
Expected: FAIL because import modules do not exist.

- [x] **Step 3: Implement reader and validation contract**

```ts
export interface ImportIssue {
  severity: "error" | "warning";
  rowNumber: number;
  field: string;
  code: "missing_sku" | "unknown_sku" | "invalid_number" | "duplicate_row" | "formula_mismatch";
  message: string;
}

export interface ImportPreview {
  checksum: string;
  rows: NormalizedImportRow[];
  issues: ImportIssue[];
  canCommit: boolean;
}
```

ExcelJS must read values only from explicitly mapped sheets/columns. Reject `.xlsm`, files larger than the configured limit, unknown mandatory sheets and any batch containing an `error`.

- [x] **Step 4: Implement staging schema and commit RPC**

The migration creates `import_batches`, `import_staging_rows`, `import_issues`, `source_snapshots`, a unique checksum/idempotency constraint, private Storage metadata, and one RPC that commits all accepted rows in a single transaction.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/unit/imports && pnpm supabase test db`
Expected: PASS; importing the same checksum twice does not create two committed snapshots.

```bash
git add src/features/imports src/app/api/imports supabase tests/unit/imports tests/fixtures/forecast-import.synthetic.xlsx
git commit -m "feat: add safe two-phase Excel import"
```

---

### Task 6: Forecast Projection, Alerts và PO Recommendation

**Files:**
- Create: `src/features/planning/domain/project-plan.ts`
- Create: `src/features/planning/domain/recommend-po.ts`
- Create: `supabase/migrations/20260811000400_projection_queries.sql`
- Test: `tests/unit/planning/project-plan.test.ts`
- Test: `tests/unit/planning/recommend-po.test.ts`
- Test: `supabase/tests/database/projection_queries.test.sql`

**Interfaces:**
- Consumes: current inventory, monthly demand, active purchase batches and planning settings.
- Produces: `MonthlyProjection[]`, `StockAlert[]`, `PurchaseRecommendation[]`, security-invoker view `plan_projection_view`.

- [x] **Step 1: Write ET-015150 regression test**

```ts
const result = projectPlan({
  openingStock: 32,
  targetStock: 0,
  monthlyDemand: [400, 400, 400, 600, 600],
  receipts: [],
});
expect(result.at(-1)?.closingStock).toBe(-2368);
expect(recommendPurchase(result, 0).minimumQty).toBe(2368);
expect(recommendPurchase(result, 0).severity).toBe("critical");
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/unit/planning`
Expected: FAIL because projection modules do not exist.

- [x] **Step 3: Implement projection and recommendation**

```ts
export interface PurchaseRecommendation {
  minimumQty: number;
  recommendedQty: number;
  firstShortageMonth: string | null;
  severity: "healthy" | "warning" | "critical";
}
```

Cancelled purchase batches contribute zero receipt. FOC contributes to stock. If safety stock is absent, `recommendedQty === minimumQty`.

- [x] **Step 4: Implement RLS-respecting projection view**

Create the view with `security_invoker = true`; index `brand_id`, `plan_version_id`, `product_id`, `eta_date` and all columns used by RLS filters.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/unit/planning && pnpm supabase test db`
Expected: PASS with final ET-015150 stock `-2368` and minimum recommendation `2368`.

```bash
git add src/features/planning supabase/migrations/20260811000400_projection_queries.sql supabase/tests/database/projection_queries.test.sql tests/unit/planning
git commit -m "feat: add stock projection and PO recommendations"
```

---

### Task 7: Configurable Approval Policy Engine

**Files:**
- Create: `src/lib/domain/approval-routing.ts`
- Create: `supabase/migrations/20260811000500_approval_engine.sql`
- Test: `tests/unit/domain/approval-routing.test.ts`
- Test: `supabase/tests/database/approval_engine.test.sql`

**Interfaces:**
- Consumes: `ApprovalRouteInput`, brand policy, plan amount and exception flags.
- Produces: `routeApproval(input): ApprovalRoute`, RPCs `submit_plan`, `approve_step`, `request_changes`.

- [x] **Step 1: Write failing routing table tests**

```ts
expect(routeApproval({ mode: "fixed_two_level", amount: "10", threshold: null, hasEscalationException: false })).toEqual({ levels: 2, reason: "fixed" });
expect(routeApproval({ mode: "threshold", amount: "999", threshold: "1000", hasEscalationException: false })).toEqual({ levels: 1, reason: "under_threshold" });
expect(routeApproval({ mode: "threshold", amount: "1000", threshold: "1000", hasEscalationException: false })).toEqual({ levels: 2, reason: "threshold_met" });
expect(routeApproval({ mode: "threshold", amount: "1", threshold: "1000", hasEscalationException: true })).toEqual({ levels: 2, reason: "exception" });
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/unit/domain/approval-routing.test.ts`
Expected: FAIL because routing module does not exist.

- [x] **Step 3: Implement routing and database schema**

Create `approval_policies`, `approval_policy_brands`, `approval_requests`, `approval_steps`. Seed one global fixed-two-level policy. Add an exclusion constraint or transaction check preventing overlapping effective policies for one brand.

- [x] **Step 4: Implement atomic RPC state transitions**

`submit_plan` captures policy mode, threshold, currency, amount, required levels and exception flags. `approve_step` verifies current user role/brand access and advances exactly one state. `request_changes` closes the request without mutating its plan snapshot.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/unit/domain/approval-routing.test.ts && pnpm supabase test db`
Expected: PASS; default policy routes two levels and threshold branch behaves at the boundary.

```bash
git add src/lib/domain/approval-routing.ts tests/unit/domain/approval-routing.test.ts supabase/migrations/20260811000500_approval_engine.sql supabase/tests/database/approval_engine.test.sql
git commit -m "feat: add configurable approval policy engine"
```

---

### Task 8: Revision, Audit, Idempotency và Optimistic Concurrency

**Files:**
- Create: `supabase/migrations/20260811000600_version_audit_concurrency.sql`
- Create: `src/features/versions/domain/diff-plan.ts`
- Test: `supabase/tests/database/version_audit_concurrency.test.sql`
- Test: `tests/unit/versions/diff-plan.test.ts`

**Interfaces:**
- Consumes: immutable plan snapshot and `lock_version`.
- Produces: RPC `create_plan_revision`, append-only `audit_events`, `PlanDiff`, conflict error code `PLAN_VERSION_CONFLICT`.

- [x] **Step 1: Write failing immutable/concurrency tests**

```sql
select throws_ok(
  $$ update public.plan_versions set version_number = 99 where status = 'approved' $$,
  'approved_plan_is_immutable',
  'approved version cannot be changed'
);
```

```ts
expect(diffPlan(before, after)).toContainEqual({
  path: "purchaseLines.ET-015150.qty",
  before: 0,
  after: 2368,
  impact: "increase",
});
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm supabase test db && pnpm vitest run tests/unit/versions`
Expected: FAIL because revision/audit implementation is missing.

- [x] **Step 3: Implement RPC and audit trigger**

`create_plan_revision` copies snapshot content, sets `parent_version_id`, increments version number, resets status to `draft`, and writes one audit event in the same transaction. Approved source remains unchanged.

- [x] **Step 4: Implement compare-and-swap save**

Draft update requires `WHERE id = p_id AND lock_version = p_expected_lock_version`, increments `lock_version`, and raises `PLAN_VERSION_CONFLICT` when zero rows update. All action RPCs accept an idempotency key protected by a unique constraint.

- [x] **Step 5: Verify and commit**

Run: `pnpm supabase test db && pnpm vitest run tests/unit/versions`
Expected: PASS; duplicate action key has no second side effect.

```bash
git add supabase/migrations/20260811000600_version_audit_concurrency.sql supabase/tests/database/version_audit_concurrency.test.sql src/features/versions tests/unit/versions
git commit -m "feat: add immutable revisions and concurrency controls"
```

---

### Task 9: Authenticated App Shell và Brand-Scoped Navigation

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/features/auth/components/login-form.tsx`
- Create: `src/features/auth/server/get-current-access.ts`
- Create: `src/components/ui/app-sidebar.tsx`
- Test: `tests/components/auth/login-form.test.tsx`
- Test: `tests/components/navigation/app-sidebar.test.tsx`

**Interfaces:**
- Consumes: Supabase cookie session and brand access rows.
- Produces: authenticated route group, role-aware sidebar, brand selector.

- [x] **Step 1: Write failing component tests**

```tsx
render(<AppSidebar access={{ roles: ["viewer"], brandIds: ["etx"] }} />);
expect(screen.getByRole("link", { name: "Forecast Planning" })).toBeVisible();
expect(screen.queryByRole("link", { name: "Chính sách duyệt" })).not.toBeInTheDocument();
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/components/auth tests/components/navigation`
Expected: FAIL because auth UI does not exist.

- [x] **Step 3: Implement login, callback and session refresh**

Use `@supabase/ssr` with cookie sessions. Root proxy refreshes auth; protected layout redirects anonymous users to `/login`; login errors use Vietnamese copy and do not reveal whether an email exists.

- [x] **Step 4: Implement role/brand navigation**

Navigation items are derived from `canPerform`, while page loaders still rely on RLS. Brand selector only shows authorized brands.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/components/auth tests/components/navigation && pnpm build`
Expected: PASS; Viewer cannot see administration links.

```bash
git add src/app src/features/auth src/components/ui tests/components/auth tests/components/navigation
git commit -m "feat: add authenticated brand-scoped app shell"
```

---

### Task 10: Import Review UI

**Files:**
- Create: `src/app/(app)/imports/page.tsx`
- Create: `src/features/imports/components/import-dropzone.tsx`
- Create: `src/features/imports/components/import-preview.tsx`
- Create: `src/features/imports/components/import-issue-list.tsx`
- Create: `src/features/imports/hooks/use-import-workflow.ts`
- Test: `tests/components/imports/import-workflow.test.tsx`

**Interfaces:**
- Consumes: preview and commit routes from Task 5.
- Produces: upload → preview diff → warning confirmation → atomic commit flow.

- [x] **Step 1: Write failing workflow test**

```tsx
await user.upload(screen.getByLabelText("Chọn file Excel"), workbookFile);
expect(await screen.findByText("ET-015027 → ET-015025")).toBeVisible();
expect(screen.getByRole("button", { name: "Xác nhận import" })).toBeEnabled();
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/components/imports`
Expected: FAIL because import UI does not exist.

- [x] **Step 3: Implement upload and preview states**

Render states `idle`, `uploading`, `preview`, `committing`, `success`, `error`. Errors disable commit; warnings require an explicit checkbox. Display added, changed, removed and ignored rows separately.

- [x] **Step 4: Implement retry-safe commit**

Generate one UUID idempotency key per user intent and reuse it for network retry. On success, show snapshot timestamp and affected Draft count.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/components/imports && pnpm build`
Expected: PASS; batch with an error cannot be committed.

```bash
git add src/app/'(app)'/imports src/features/imports/components src/features/imports/hooks tests/components/imports
git commit -m "feat: add Excel import review workflow"
```

---

### Task 11: Forecast Planning Workspace

**Files:**
- Create: `src/app/(app)/planning/[cycleId]/page.tsx`
- Create: `src/features/planning/components/planning-header.tsx`
- Create: `src/features/planning/components/kpi-strip.tsx`
- Create: `src/features/planning/components/stock-alert.tsx`
- Create: `src/features/planning/components/planning-grid.tsx`
- Create: `src/features/planning/components/planning-insights.tsx`
- Create: `src/features/planning/hooks/use-draft-autosave.ts`
- Create: `src/features/planning/hooks/use-plan-presence.ts`
- Test: `tests/components/planning/planning-workspace.test.tsx`
- Test: `tests/components/planning/autosave-conflict.test.tsx`

**Interfaces:**
- Consumes: projections, PO batches, role access and `lock_version`.
- Produces: editable Draft grid, KPI, Critical alerts, PO proposal and conflict dialog.

- [x] **Step 1: Write failing ET-015150 UI test**

```tsx
render(<PlanningWorkspace initialPlan={et015150Fixture} />);
expect(screen.getByText("ET-015150 dự kiến thiếu 2.368 sản phẩm")).toBeVisible();
expect(screen.getByRole("button", { name: "Tạo PO đề xuất 2.368" })).toBeEnabled();
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/components/planning`
Expected: FAIL because planning components do not exist.

- [x] **Step 3: Implement layout and TanStack grid**

Pin SKU/name columns; mark editable Qty/FOC/Ex Price cells; render Amount and Projected Stock read-only. KPI strip shows target, committed, gap, Critical count and PO count. All severity cells include textual badges.

- [x] **Step 4: Implement autosave and conflict UX**

Debounce Draft save, show `Đang lưu`, `Đã lưu` and `Lỗi lưu`. A `PLAN_VERSION_CONFLICT` response opens a diff dialog and never overwrites remote data silently.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/components/planning && pnpm build`
Expected: PASS at 1366×768 viewport; ET-015150 alert and proposal are visible without horizontal scrolling.

```bash
git add src/app/'(app)'/planning src/features/planning/components src/features/planning/hooks tests/components/planning
git commit -m "feat: add forecast planning workspace"
```

---

### Task 12: Approval, Policy Admin và Version Diff UI

**Files:**
- Create: `src/app/(app)/approvals/page.tsx`
- Create: `src/app/(app)/versions/[versionId]/page.tsx`
- Create: `src/app/(app)/admin/approval-policies/page.tsx`
- Create: `src/features/approvals/components/approval-inbox.tsx`
- Create: `src/features/approvals/components/approval-review.tsx`
- Create: `src/features/approvals/components/policy-editor.tsx`
- Create: `src/features/versions/components/version-diff.tsx`
- Test: `tests/components/approvals/approval-flow.test.tsx`
- Test: `tests/components/versions/version-diff.test.tsx`

**Interfaces:**
- Consumes: approval RPCs and `PlanDiff`.
- Produces: submit preview, approval inbox, policy assignment and revision comparison.

- [x] **Step 1: Write failing approval UI tests**

```tsx
render(<SubmitPlanDialog route={{ levels: 2, reason: "fixed" }} />);
expect(screen.getByText("Kế hoạch sẽ được duyệt 2 cấp")).toBeVisible();
expect(screen.getByText("Manager → CFO/CEO")).toBeVisible();
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/components/approvals tests/components/versions`
Expected: FAIL because approval/version UI does not exist.

- [x] **Step 3: Implement approval inbox and review**

Review page prioritizes exceptions, Amount change, budget impact, shortage impact and version diff. Approve/Request changes requires confirmation; Request changes requires a non-empty reason.

- [x] **Step 4: Implement policy editor and brand bulk assignment**

Administrator can choose fixed-two-level or threshold, currency, threshold amount, escalation flags, effective dates and one/many brands. UI warns that policy changes do not affect in-flight requests.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/components/approvals tests/components/versions && pnpm build`
Expected: PASS; Viewer cannot render decision controls and in-flight policy snapshot remains unchanged.

```bash
git add src/app/'(app)'/approvals src/app/'(app)'/versions src/app/'(app)'/admin/approval-policies src/features/approvals src/features/versions/components tests/components/approvals tests/components/versions
git commit -m "feat: add approvals policies and version review"
```

---

### Task 13: Dashboard, PO Timeline và Excel Export

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/features/reports/components/dashboard-kpis.tsx`
- Create: `src/features/reports/components/po-timeline.tsx`
- Create: `src/features/reports/server/export-plan.ts`
- Create: `src/app/api/reports/plans/[versionId]/export/route.ts`
- Test: `tests/unit/reports/export-plan.test.ts`
- Test: `tests/components/reports/dashboard.test.tsx`

**Interfaces:**
- Consumes: approved/draft plan projection and purchase batches.
- Produces: dashboard, PO timeline and `.xlsx` export generated from canonical data.

- [x] **Step 1: Write failing export test**

```ts
const workbook = await exportPlanToWorkbook(planFixture);
const sheet = workbook.getWorksheet("Forecast Plan");
expect(sheet?.getCell("A2").value).toBe("ET-015150");
expect(sheet?.getCell("H2").value).toBe(2368 * 12.5);
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/unit/reports tests/components/reports`
Expected: FAIL because reporting modules do not exist.

- [x] **Step 3: Implement dashboard and timeline**

Render target amount, committed amount, gap, Critical count, PO count, dynamic timeline and status legend. Filters include brand, cycle, status and time range.

- [x] **Step 4: Implement export from canonical data**

Export values, not copied workbook formulas. Amount is generated from canonical Qty/Ex Price. Include metadata sheet with plan version, source snapshot, export user and export timestamp.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/unit/reports tests/components/reports && pnpm build`
Expected: PASS; exported Amount equals Qty × Ex Price.

```bash
git add src/app/'(app)'/dashboard src/app/api/reports src/features/reports tests/unit/reports tests/components/reports
git commit -m "feat: add planning dashboard and Excel export"
```

---

### Task 14: E2E, Security Gates, CI và Documentation

**Files:**
- Create: `tests/e2e/import-plan-approve.spec.ts`
- Create: `tests/e2e/threshold-approval.spec.ts`
- Create: `tests/e2e/revision-conflict.spec.ts`
- Create: `tests/e2e/brand-access.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Create: `docs/operations/local-development.md`
- Create: `docs/operations/secret-rotation.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete MVP.
- Produces: reproducible local workflow, CI gates and acceptance evidence.

- [x] **Step 1: Write failing E2E journeys**

```ts
test("ET-015150 goes through default two-level approval", async ({ page }) => {
  await page.goto("/planning/etx-2026");
  await expect(page.getByText("ET-015150 dự kiến thiếu 2.368 sản phẩm")).toBeVisible();
  await page.getByRole("button", { name: "Tạo PO đề xuất 2.368" }).click();
  await page.getByRole("button", { name: "Gửi duyệt 2 cấp" }).click();
  await expect(page.getByText("Chờ duyệt cấp 1")).toBeVisible();
});
```

- [x] **Step 2: Run E2E and verify RED**

Run: `pnpm exec playwright test --project=chromium`
Expected: FAIL until test users, fixtures and all routes are wired together.

- [x] **Step 3: Add deterministic test setup**

Use Supabase seed users for all five roles, isolate each test with a unique planning cycle, and reset test data through a test-only authenticated helper unavailable in production builds.

- [x] **Step 4: Add CI gates**

`.github/workflows/ci.yml` runs:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm lint
- run: pnpm exec tsc --noEmit
- run: pnpm vitest run --coverage
- run: pnpm supabase start
- run: pnpm supabase test db
- run: pnpm build
- run: pnpm exec playwright test --project=chromium
```

CI must also scan tracked files and built assets for forbidden secret patterns and fail if any database URL/password/service-role key is detected.

- [x] **Step 5: Run full acceptance verification**

Run:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm vitest run --coverage
pnpm supabase db reset
pnpm supabase test db
pnpm build
pnpm exec playwright test --project=chromium
git grep -n -E 'postgresql://|service_role.*=' -- ':!docs/superpowers/plans/*'
```

Expected: all quality commands PASS; final grep returns no matches.

- [x] **Step 6: Document local operation and commit**

README must include prerequisites, `.env.local` setup without secret values, Supabase start/reset commands, test commands, database migration workflow, login seed accounts and GitHub workflow behavior.

```bash
git add tests/e2e .github README.md docs/operations package.json
git commit -m "test: add end-to-end acceptance and CI gates"
```

---

## Final MVP Verification Checklist

- [x] ET-015150 regression returns projected stock `-2368` and recommendation `2368`.
- [x] Database-generated Amount equals Qty × Ex Price for all purchase lines.
- [x] Three Đặc trị xanh aliases resolve to ET-015025.
- [x] Import error blocks batch; warning requires confirmation; duplicate checksum is idempotent.
- [x] Default policy routes two approval levels.
- [x] Threshold and exception boundaries route correctly.
- [x] Submitted/Approved versions are immutable; revisions preserve lineage.
- [x] RLS matrix passes for every role and brand boundary.
- [x] Concurrent Draft edits produce a conflict instead of silent overwrite.
- [x] Export is produced from canonical data and contains correct Amount.
- [x] No secret appears in tracked files, Git history or browser bundle.
- [x] Lint, type-check, unit, database, build and Chromium E2E pass with fresh evidence.

## Execution Record

- Status: **Implementation complete; final CI evidence recorded in the audit file** on 2026-08-12.
- Final audit: [`docs/audits/2026-08-12-final-audit.md`](../../audits/2026-08-12-final-audit.md).
- The final implementation extends the original MVP with source workbook materialization, configurable planning settings/target cover, persisted revision diffs, revision UI/API, derived approval exceptions, missing Ex Price submit guard and default settings for new brands.
- Security hardening includes active-profile enforcement, column-scoped self-update, brand-scoped administrator replacement, active-administrator invariant locking, idempotent/audited access changes and expanded secret scanning.
- Fresh local application evidence: 35 Vitest files / 88 tests, lint, TypeScript, production build, browser-bundle secret scan and production reset-route harness all pass.
- Fresh remote database evidence: 16 pgTAP files / 138 assertions pass; Supabase `db lint --level warning --fail-on warning` reports no schema errors; migration ledger is synchronized through `20260811001040_fix_submit_derived_exceptions.sql`.
- Local Docker/Colima could not start Supabase because the scoped PostgreSQL volume reported `No space left on device` while creating `pg_wal`; the isolated Ubuntu CI workflow is the authoritative local-E2E evidence.
- GitHub Actions commit/run URL and Chromium E2E result are maintained in the audit file after the final push.

## Original Execution Handoff

The guidance below is retained as historical context; implementation is complete.

Recommended execution mode is **Subagent-Driven Development** because database, import, domain, UI and test slices have distinct review gates. Use one fresh implementation agent per task and complete both spec-compliance review and code-quality review before advancing.

If execution must remain in one session, use **Inline Execution** with `superpowers:executing-plans`, completing tasks sequentially and pausing after each database/UI milestone for verification.
