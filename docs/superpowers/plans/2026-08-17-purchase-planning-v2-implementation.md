# Purchase Planning V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển ứng dụng hiện tại thành hệ thống lập, phê duyệt và vận hành kế hoạch mua hàng năm theo từng nhãn hàng, với bản nháp riêng tư, tuyến duyệt theo sơ đồ tổ chức, đề xuất nhập hàng độc lập và dashboard theo vai trò.

**Architecture:** Xây V2 song song trong cùng Next.js/Supabase modular monolith. Giữ Auth, session, `brands`, `products`, `sku_aliases`, idempotency/audit và các primitive UI có thể tái sử dụng; bổ sung organization/capability, annual-plan, stable purchase wave, proposal, notification và projection mới. Chỉ xóa route/table nghiệp vụ cũ sau khi migration, pgTAP, API, component và E2E với database thật đạt.

**Tech Stack:** Next.js App Router hiện hành, React hiện hành, TypeScript 6 strict, Supabase Auth/Postgres/RLS, Zod, Decimal.js, ExcelJS, TanStack Table, Vitest/Testing Library, pgTAP, Playwright, pnpm 11.

**Source spec:** `docs/superpowers/specs/2026-08-17-purchase-planning-v2-design.md`

## Global Constraints

- Chỉ cho tạo kế hoạch ở năm hiện tại hoặc tương lai; không tạo kế hoạch quá khứ.
- Bản nháp kế hoạch và đề xuất chỉ owner đọc/sửa; Administrator chỉ thấy metadata phục vụ governance.
- Mỗi user có đúng một organizational tier; `Administrator` là capability độc lập.
- Active Leader phải có active Manager; active Manager phải có active CEO/BOD; cấm self-loop/cycle.
- Amount luôn bằng Paid Qty × Ex Price; FOC không tính vào Amount.
- Tổng Qty và tổng FOC của mọi PO phải khớp chính xác annual line trước submit.
- PO dùng month-level `YYYY-MM`; không giả ngày đầu tháng.
- Stable PO ID không đổi qua plan revision; PO có transaction không được hard delete.
- Over-plan được phép nhưng luôn cảnh báo và bắt buộc duyệt hai cấp.
- Mặc định proposal policy là hai cấp; Admin có thể áp dụng policy cho một/nhiều brand.
- Dashboard chính thức chỉ dùng approved baseline và dữ liệu operational được phép.
- Excel chỉ là adapter điền cùng bản nháp; không còn menu/import pipeline nghiệp vụ độc lập.
- UI dùng đúng Sagen: Be Vietnam Pro, Lora, Charcoal/Off-white/Champagne Gold, tiếng Việt, WCAG AA.
- Server-only DAL phải import `server-only`, tự authorize và chỉ trả DTO tối thiểu.
- Mỗi Route Handler/Server Action phải tự xác thực, authorize và validate; không dựa vào page-level check.
- Mọi table exposed mới phải có explicit grants, RLS, index cho RLS/filter và pgTAP impersonation tests.
- Mọi command nhạy cảm phải transaction-safe, idempotent, có correlation ID và audit.
- Không chỉnh database production ad-hoc. Migration phải được thử ở local hoặc test database không phải production trước.
- Không xóa business/demo data trước Task 17 và trước khi backup/restore rehearsal đạt.
- Không commit/push/PR trong lúc thực thi nếu chưa có task-specific user authority. Các bước commit dưới đây là checkpoint có điều kiện.

---

## File Structure Map

### Shared contracts and API boundary

- `src/lib/api/contract.ts` — success/error DTO, correlation ID và response helpers.
- `src/lib/api/parse-request.ts` — Zod boundary parsing cho JSON/FormData.
- `src/lib/idempotency.ts` — client idempotency-key generator và transport header helper.
- `src/features/auth/access-types.ts` — CurrentAccess V2 DTO.
- `src/features/auth/permissions.ts` — organizational tier/capability predicates.

### Organization and master data

- `src/features/organization/contracts.ts` — tier, capability, reporting-line DTO/schema.
- `src/features/organization/server/get-organization-context.ts` — server-only access DAL.
- `src/features/organization/components/organization-access-manager.tsx` — Admin editor.
- `src/features/master-data/contracts.ts` — brand/product create/update schema.
- `src/features/master-data/server/load-master-data.ts` — authorized master-data DTO loaders.
- `src/features/master-data/components/brand-modal.tsx` — inline create-brand dialog.
- `src/features/master-data/components/product-modal.tsx` — inline create-SKU dialog.

### Annual plans

- `src/features/annual-plans/contracts.ts` — plan/wave DTO và request schemas.
- `src/features/annual-plans/domain/calculations.ts` — Decimal-based amounts/totals.
- `src/features/annual-plans/domain/validation.ts` — step gates và allocation equality.
- `src/features/annual-plans/server/load-annual-plan.ts` — owner/approver-safe DAL.
- `src/features/annual-plans/components/annual-plan-wizard.tsx` — four-step state shell.
- `src/features/annual-plans/components/annual-lines-step.tsx` — annual SKU table.
- `src/features/annual-plans/components/purchase-wave-step.tsx` — PO allocation matrix.
- `src/features/annual-plans/components/annual-plan-review.tsx` — review/submit.

### Excel adapter

- `src/features/annual-plans/excel/template.ts` — two-sheet workbook generator.
- `src/features/annual-plans/excel/parser.ts` — template-only parser.
- `src/features/annual-plans/excel/validation.ts` — localized cell diagnostics.
- `src/features/annual-plans/components/excel-import-dialog.tsx` — preview/replace/checkpoint UI.

### Proposals and approval

- `src/features/proposals/contracts.ts` — proposal/line/route DTO schemas.
- `src/features/proposals/domain/routing.ts` — threshold/over-plan route decision.
- `src/features/proposals/server/load-proposals.ts` — owner/approver-safe DAL.
- `src/features/proposals/components/proposal-form.tsx` — Leader/Manager/Executive create flow.
- `src/features/proposals/components/proposal-review.tsx` — Manager PO assignment and decision UI.
- `src/features/notifications/contracts.ts` — notification DTO.
- `src/features/notifications/components/notification-center.tsx` — bell, list, unread state.

### Dashboard and cutover

- `src/features/dashboard/contracts.ts` — role-aware dashboard DTO.
- `src/features/dashboard/server/load-role-dashboard.ts` — approved-only projections.
- `src/features/dashboard/components/role-dashboard.tsx` — common shell and role sections.
- `src/app/(app)/annual-plans/` — V2 annual-plan routes.
- `src/app/(app)/purchase-waves/` — operational PO routes.
- `src/app/(app)/proposals/` — proposal routes.
- `src/app/(app)/notifications/page.tsx` — notification center route.
- `src/app/api/v2/` — versioned command contracts during parallel cutover.
- `supabase/migrations/20260817*.sql` — expand/transition/contract migrations.
- `supabase/tests/database/v2_*.test.sql` — pgTAP RLS/invariant tests.

---

### Task 1: Freeze V2 Contracts and API Error Semantics

**Files:**
- Create: `src/lib/api/contract.ts`
- Create: `src/lib/api/parse-request.ts`
- Create: `src/lib/idempotency.ts`
- Create: `src/features/organization/contracts.ts`
- Create: `src/features/annual-plans/contracts.ts`
- Create: `src/features/proposals/contracts.ts`
- Test: `tests/unit/api/v2-contracts.test.ts`

**Interfaces:**
- Produces: `ApiSuccess<T>`, `ApiFailure`, `apiError()`, `parseJson()`, `createIdempotencyKey()`.
- Produces: `OrgTier`, `Capability`, `AnnualPlanStatus`, `ProposalStatus` and Zod schemas used by every later route/component.
- Consumes: Zod and browser `crypto.randomUUID()`.

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { annualLineInputSchema } from "@/features/annual-plans/contracts";
import { organizationAssignmentSchema } from "@/features/organization/contracts";
import { proposalInputSchema } from "@/features/proposals/contracts";

describe("V2 contracts", () => {
  it("rejects negative commercial quantities", () => {
    expect(annualLineInputSchema.safeParse({
      productId: crypto.randomUUID(),
      exPrice: "1.75",
      paidQty: -1,
      expectedFoc: 0,
      openingStock: 0,
    }).success).toBe(false);
  });

  it("requires a supervisor for active Leader and Manager assignments", () => {
    expect(organizationAssignmentSchema.safeParse({
      tier: "leader",
      isActive: true,
      supervisorId: null,
    }).success).toBe(false);
  });

  it("requires at least one positive proposal line", () => {
    expect(proposalInputSchema.safeParse({
      brandId: crypto.randomUUID(), planningYear: 2027,
      neededMonth: "2027-03", reason: "Bổ sung bán hàng", lines: [],
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm vitest run tests/unit/api/v2-contracts.test.ts`

Expected: FAIL because the V2 contract modules do not exist.

- [ ] **Step 3: Implement exact shared types and schemas**

```ts
// src/features/organization/contracts.ts
export const orgTiers = ["employee_viewer", "leader", "manager", "executive"] as const;
export const capabilities = [
  "create_annual_plan",
  "view_approved_plan",
  "create_purchase_proposal",
  "manage_master_data",
  "administer_system",
] as const;
export type OrgTier = (typeof orgTiers)[number];
export type Capability = (typeof capabilities)[number];

export const organizationAssignmentSchema = z.object({
  tier: z.enum(orgTiers),
  isActive: z.boolean(),
  supervisorId: z.string().uuid().nullable(),
}).superRefine((value, ctx) => {
  if (value.isActive && ["leader", "manager"].includes(value.tier) && !value.supervisorId) {
    ctx.addIssue({ code: "custom", path: ["supervisorId"], message: "Bắt buộc chọn người quản lý trực tiếp." });
  }
});
```

```ts
// src/features/annual-plans/contracts.ts
export const annualPlanStatuses = [
  "draft_owner_only", "pending_executive", "approved", "changes_requested",
  "rejected", "withdrawn", "superseded",
] as const;
export type AnnualPlanStatus = (typeof annualPlanStatuses)[number];

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải có định dạng YYYY-MM.");
export const annualLineInputSchema = z.object({
  productId: z.string().uuid(),
  exPrice: z.string().regex(/^\d+(\.\d{1,6})?$/),
  paidQty: z.number().int().nonnegative(),
  expectedFoc: z.number().int().nonnegative(),
  openingStock: z.number().int().nonnegative(),
});
```

```ts
// src/features/proposals/contracts.ts
export const proposalStatuses = [
  "draft", "pending_manager", "pending_executive", "changes_requested", "approved",
  "rejected", "withdrawn", "cancellation_pending_manager",
  "cancellation_pending_executive", "cancelled",
] as const;
export type ProposalStatus = (typeof proposalStatuses)[number];

export const proposalInputSchema = z.object({
  brandId: z.string().uuid(),
  planningYear: z.number().int().min(new Date().getFullYear()),
  neededMonth: monthSchema,
  reason: z.string().trim().min(10).max(1000),
  lines: z.array(z.object({ productId: z.string().uuid(), requestedQty: z.number().int().positive() })).min(1),
});
```

```ts
// src/lib/api/contract.ts
export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; fieldErrors?: Record<string, string[]>; retryable: boolean; correlationId: string };
}
export interface ApiSuccess<T> { ok: true; data: T; correlationId: string }
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function apiError(status: number, code: string, message: string, correlationId: string, retryable = false) {
  return Response.json({ ok: false, error: { code, message, retryable, correlationId } } satisfies ApiFailure, { status });
}
```

Use decimal values as normalized strings at API boundaries; convert with Decimal.js inside domain functions. Use `YYYY-MM` regex plus calendar validation for month fields.

- [ ] **Step 4: Run focused tests, typecheck and diff guard**

Run: `pnpm vitest run tests/unit/api/v2-contracts.test.ts && pnpm typecheck && git diff --check`

Expected: all commands PASS.

- [ ] **Step 5: Reviewer gate and conditional checkpoint commit**

Review that later tasks import only these canonical unions/schemas. If Git lifecycle is explicitly authorized, commit only Task 1 files with `feat(v2): define purchase planning contracts`; otherwise record the verified diff and continue without commit.

---

### Task 2: Add Organization Hierarchy, Capabilities and RLS

**Files:**
- Create: `supabase/migrations/20260817000100_v2_organization_and_capabilities.sql`
- Create: `supabase/tests/database/v2_organization_access.test.sql`
- Modify: `src/features/auth/access-types.ts`
- Modify: `src/features/auth/permissions.ts`
- Create: `src/features/organization/server/get-organization-context.ts`
- Test: `tests/unit/auth/v2-permissions.test.ts`

**Interfaces:**
- Consumes: `OrgTier`, `Capability` from Task 1.
- Produces DB functions: `current_profile_is_active()`, `current_user_has_capability(public.user_capability)`, `can_use_brand_capability(uuid,public.user_capability)`, `set_user_organization_v2(uuid,public.org_tier,boolean,uuid,public.user_capability[],uuid[],uuid,uuid)` and `list_manageable_users_v2()`.
- Produces `CurrentAccessV2` with direct/inherited brand capabilities and reporting-line IDs.

- [ ] **Step 1: Write RED pgTAP tests for hierarchy and RLS**

Add impersonation cases that assert:

```sql
select throws_ok(
  $$ select public.set_user_organization_v2(
       :'leader_id'::uuid, 'leader', true, null, array[]::public.user_capability[], array[]::uuid[], gen_random_uuid()
     ) $$,
  'P0001', 'ACTIVE_SUPERVISOR_REQUIRED'
);

select throws_ok(
  $$ select public.set_user_organization_v2(
       :'manager_id'::uuid, 'manager', true, :'leader_id'::uuid, array[]::public.user_capability[], array[]::uuid[], gen_random_uuid()
     ) $$,
  'P0001', 'INVALID_SUPERVISOR_TIER'
);

select is(
  public.can_use_brand_capability(:'brand_id'::uuid, 'view_approved_plan'),
  true,
  'assigned Manager inherits approval visibility upward from Leader'
);
```

Also test inactive sessions, cycle rejection, self-deactivation rejection, last active Administrator protection, atomic replacement and that a normal user cannot update `profiles.is_active` directly.

- [ ] **Step 2: Run DB tests and verify RED**

Run: `pnpm test:db:local`

Expected: new test fails because V2 enum/tables/functions do not exist. If the local Supabase runtime is unavailable, stop this task and provision an explicitly non-production test database; do not substitute production.

- [ ] **Step 3: Implement expand migration**

The migration must:

```sql
create type public.org_tier as enum ('employee_viewer','leader','manager','executive');
create type public.user_capability as enum (
  'create_annual_plan','view_approved_plan','create_purchase_proposal','manage_master_data','administer_system'
);

alter table public.profiles add column org_tier public.org_tier not null default 'employee_viewer';

create table public.reporting_lines (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  supervisor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id <> supervisor_id)
);

create table public.user_capabilities (
  user_id uuid not null references public.profiles(id) on delete cascade,
  capability public.user_capability not null,
  created_at timestamptz not null default now(),
  primary key (user_id, capability)
);

create table public.user_brand_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  capability public.user_capability not null,
  source_kind text not null check (source_kind in ('direct','inherited')),
  source_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id, capability, source_kind, source_user_id)
);
```

Use an advisory transaction lock in `set_user_organization_v2`. Validate supervisor tier, active status, cycle absence and post-state active Administrator invariant. Rebuild inherited rows atomically and reassign pending work through a private helper. Revoke all default access, then grant only required statements/functions to `authenticated` and `service_role`. Add indexes for `(supervisor_id)`, `(user_id,capability)`, `(user_id,brand_id,capability)` and inherited source lookup.

- [ ] **Step 4: Harden profile self-update**

Replace broad `profiles_update_own` with a policy/trigger or column-specific RPC that permits self-edit of `display_name` only. Direct self-update of `is_active` or `org_tier` must fail under impersonation.

- [ ] **Step 5: Implement server-only access DAL**

```ts
export interface CurrentAccessV2 {
  userId: string;
  displayName: string;
  tier: OrgTier;
  isAdministrator: boolean;
  capabilities: Capability[];
  supervisorId: string | null;
  executiveId: string | null;
  brands: Array<{ id: string; code: string; name: string; capabilities: Capability[]; sources: string[] }>;
}

export const currentAccessV2Schema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1),
  tier: z.enum(orgTiers),
  isAdministrator: z.boolean(),
  capabilities: z.array(z.enum(capabilities)),
  supervisorId: z.string().uuid().nullable(),
  executiveId: z.string().uuid().nullable(),
  brands: z.array(z.object({
    id: z.string().uuid(), code: z.string(), name: z.string(),
    capabilities: z.array(z.enum(capabilities)), sources: z.array(z.string()),
  })),
});

export const getOrganizationContext = cache(async (): Promise<CurrentAccessV2 | null> => {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("get_current_access_v2");
  if (error || !data) return null;
  return currentAccessV2Schema.parse(data);
});
```

The DAL must return `null` for inactive profiles and never serialize internal permission rows to Client Components.

During Tasks 2–16, keep the existing `CurrentAccess`/`AppRole` exports intact for legacy routes and add V2 exports side-by-side. Task 15 switches the authenticated layout/navigation to `CurrentAccessV2`; Task 17 then removes the unused legacy role/access code. This preserves a compiling application throughout expand/transition.

- [ ] **Step 6: Run DB, unit, type and security checks**

Run: `pnpm test:db:local && pnpm vitest run tests/unit/auth/v2-permissions.test.ts tests/unit/auth/access-types.test.ts && pnpm typecheck && pnpm check:secrets`

Expected: all PASS.

- [ ] **Step 7: Reviewer gate and conditional checkpoint commit**

Require a security-focused review of RLS, grants, self-update and hierarchy race conditions. With Git authority, commit `feat(v2): add organization hierarchy and capabilities`.

---

### Task 3: Replace Admin Access UI with Organization Governance

**Files:**
- Create: `src/features/organization/components/organization-access-manager.tsx`
- Create: `src/features/organization/components/reporting-line-select.tsx`
- Create: `src/features/organization/components/create-account-dialog.tsx`
- Create: `src/app/api/v2/admin/users/route.ts`
- Create: `src/app/api/v2/admin/users/organization/route.ts`
- Modify: `src/app/(app)/admin/users/page.tsx`
- Modify: `src/app/styles/administration.css`
- Test: `tests/components/admin/organization-access-manager.test.tsx`
- Test: `tests/components/admin/create-account-dialog.test.tsx`
- Test: `tests/unit/admin/v2-create-account-route.test.ts`
- Test: `tests/unit/admin/v2-user-organization-route.test.ts`

**Interfaces:**
- Consumes `list_manageable_users_v2()` and `set_user_organization_v2()` from Task 2.
- Produces `OrganizationUserDTO` and an Admin UI that saves one tier, exact supervisor, capabilities and direct brand scope in one command.

- [ ] **Step 1: Write failing component and route tests**

Cover:

```ts
it("requires one Manager when activating a Leader", async () => {
  render(<OrganizationAccessManager users={[activeLeader]} supervisors={[]} onSave={saveSpy} />);
  await userEvent.click(screen.getByRole("button", { name: "Lưu quyền truy cập" }));
  expect(await screen.findByText("Bắt buộc chọn người quản lý trực tiếp.")).toBeVisible();
  expect(saveSpy).not.toHaveBeenCalled();
});

it("shows direct and inherited brand permissions separately", () => {
  render(<OrganizationAccessManager users={[managerWithInheritedBrand]} supervisors={[executive]} onSave={saveSpy} />);
  expect(screen.getByText("Được cấp trực tiếp")).toBeVisible();
  expect(screen.getByText("Kế thừa từ Leader An")).toBeVisible();
});

it("requires a replacement before deactivating a Manager with subordinates", async () => {
  render(<OrganizationAccessManager users={[managerWithLeader]} supervisors={[replacementManager]} onSave={saveSpy} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Tài khoản đang hoạt động" }));
  expect(await screen.findByRole("dialog", { name: "Chọn người quản lý thay thế" })).toBeVisible();
});

it("reconciles the canonical response after save", async () => {
  saveSpy.mockResolvedValue(canonicalManagerResponse);
  render(<OrganizationAccessManager users={[managerBeforeSave]} supervisors={[executive]} onSave={saveSpy} />);
  await userEvent.click(screen.getByRole("button", { name: "Lưu quyền truy cập" }));
  expect(await screen.findByText("Kế thừa từ Leader Bình")).toBeVisible();
});
```

Route tests must assert `403` for non-Administrator, `422` for schema failure, `409` for hierarchy conflict and success response containing the canonical post-save DTO.

Account-creation tests must assert the UI accepts only the email prefix, produces `<prefix>@sagen-groupe.com`, requires display name/initial password/tier/supervisor, rejects duplicate email and never returns/logs the password.

Define the test fixtures in the same test file with this DTO shape so the examples compile:

```ts
interface OrganizationUserDTO {
  id: string;
  displayName: string;
  isActive: boolean;
  tier: OrgTier;
  supervisorId: string | null;
  capabilities: Capability[];
  directBrands: Array<{ id: string; code: string; name: string }>;
  inheritedBrands: Array<{ id: string; code: string; name: string; sourceUserName: string }>;
  subordinateCount: number;
}
```

Create concrete fixtures `activeLeader`, `managerWithInheritedBrand`, `managerWithLeader`, `replacementManager`, `executive`, `managerBeforeSave` and `canonicalManagerResponse` with fixed UUID literals and the required fields above; do not use partial casts.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/components/admin/organization-access-manager.test.tsx tests/unit/admin/v2-user-organization-route.test.ts`

- [ ] **Step 3: Implement route boundary and canonical response**

The organization route validates `organizationAssignmentSchema`, requires `administer_system`, forwards one UUID idempotency key and maps SQLSTATE/domain errors to the shared API contract. It must not use a service-role client to bypass caller authorization.

The account-create route first authenticates and authorizes the calling Administrator with the normal server client, then uses a server-only Supabase Admin client solely for `auth.admin.createUser`. It builds the email with `toSagenEmail(prefix)`, sets the supplied initial password, creates profile/organization data transactionally through a V2 command, never echoes the password and writes audit without credential fields. If organization creation fails, it deletes the just-created Auth user before returning an error.

- [ ] **Step 4: Implement the governance editor**

Add `Tạo tài khoản` above the user list. The dialog fields are email prefix, display name, initial password, tier and supervisor. Render the existing-user sections in this order: account status → organizational tier → supervisor → capabilities → direct brand permissions → inherited permissions summary. Use controlled canonical state; after save, replace the selected user record with the API response. Add a sticky action footer and accessible replacement confirmation dialog.

- [ ] **Step 5: Verify focused and affected suites**

Run: `pnpm vitest run tests/components/admin tests/unit/admin tests/unit/auth tests/unit/security && pnpm lint && pnpm typecheck && pnpm check:secrets && git diff --check`

- [ ] **Step 6: Reviewer gate and conditional checkpoint commit**

Review that Administrator cannot create invalid active hierarchy and stale UI cannot overwrite server state. With authority, commit `feat(admin): manage organization hierarchy`.

---

### Task 4: Add Authorized Brand and SKU Creation

**Files:**
- Create: `supabase/migrations/20260817000200_v2_master_data_commands.sql`
- Create: `supabase/tests/database/v2_master_data.test.sql`
- Create: `src/features/master-data/contracts.ts`
- Create: `src/features/master-data/server/load-master-data.ts`
- Create: `src/features/master-data/components/brand-modal.tsx`
- Create: `src/features/master-data/components/product-modal.tsx`
- Create: `src/features/master-data/components/master-data-manager.tsx`
- Create: `src/app/(app)/master-data/brands/page.tsx`
- Create: `src/app/(app)/master-data/products/page.tsx`
- Create: `src/app/api/v2/master-data/brands/route.ts`
- Create: `src/app/api/v2/master-data/brands/[brandId]/route.ts`
- Create: `src/app/api/v2/master-data/products/route.ts`
- Create: `src/app/api/v2/master-data/products/[productId]/route.ts`
- Test: `tests/components/master-data/create-master-data.test.tsx`
- Test: `tests/unit/master-data/v2-master-data-routes.test.ts`

**Interfaces:**
- Produces `create_brand_v2(code,name,idempotency_key)` and `create_product_v2(brand_id,sku,name,idempotency_key)`.
- Produces `BrandOptionDTO`, `ProductOptionDTO`, modal `onCreated(dto)` callbacks consumed by Task 7/8 and an Admin manager for rename/deactivate/reactivate.

```ts
export interface BrandOptionDTO { id: string; code: string; name: string; isActive: boolean }
export interface ProductOptionDTO { id: string; brandId: string; canonicalSku: string; name: string; isActive: boolean; aliases: string[] }
```

- [ ] **Step 1: Write RED domain/route/pgTAP tests**

Assert uppercase normalization, global SKU uniqueness, brand assignment by ID, prefix mismatch warning without rejection, immediate brand activation, creator direct permission, upward inherited visibility and canonical aliases `ET-015026/ET-015027 → ET-015025` when canonical product exists.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm test:db:local && pnpm vitest run tests/components/master-data tests/unit/master-data`

- [ ] **Step 3: Implement SQL commands and RLS**

Use existing `brands`, `products`, `sku_aliases`. Commands normalize codes via `upper(btrim(p_code))`, acquire idempotency, authorize capability, insert audit, return a minimal DTO and emit a warning field instead of failing on prefix mismatch. Update/deactivate commands reject deactivation when an active workflow would become invalid and return the dependent record count. Do not permit direct client mutation of brand/product ownership fields outside the command.

- [ ] **Step 4: Implement server DTO loaders and modal forms**

`loadBrandOptions()` returns only active brands with usable capability. `loadProductOptions(brandId)` always applies the authorized brand filter. Dialogs use native labels, focus trap, Escape/focus return and `aria-live` errors; `onCreated` inserts the canonical server DTO into the current selector without a page reload. Admin pages reuse the same DTO/commands and show active/inactive filters, dependent-workflow warnings and explicit confirmation before deactivation.

- [ ] **Step 5: Verify master-data boundary**

Run: `pnpm test:db:local && pnpm vitest run tests/components/master-data tests/unit/master-data tests/unit/domain/sku.test.ts && pnpm lint && pnpm typecheck`

- [ ] **Step 6: Reviewer gate and conditional checkpoint commit**

Review brand scope inheritance and global SKU collision behavior. With authority, commit `feat(v2): add inline brand and SKU creation`.

---

### Task 5: Create Annual Plan, Revision and Stable Purchase-Wave Schema

**Files:**
- Create: `supabase/migrations/20260817000300_v2_annual_plan_core.sql`
- Create: `supabase/tests/database/v2_annual_plan_core.test.sql`
- Create: `supabase/tests/database/v2_annual_plan_privacy.test.sql`

**Interfaces:**
- Produces tables `annual_plan_cycles`, `annual_plan_revisions`, `annual_plan_lines`, `purchase_waves`, `purchase_wave_revisions`, `purchase_wave_allocations`.
- Produces functions `create_or_resume_annual_plan_v2(uuid,integer,uuid)`, `save_annual_plan_scope_v2(uuid,integer,uuid)`, `save_annual_plan_lines_v2(uuid,integer,jsonb,uuid)`, `save_purchase_wave_allocations_v2(uuid,integer,jsonb,uuid)` and `create_annual_plan_revision_v2(uuid,uuid)`.

- [ ] **Step 1: Write RED pgTAP tests for schema invariants**

Tests must prove:

```sql
select throws_ok(
  $$ select public.create_or_resume_annual_plan_v2(:'brand_id', extract(year from current_date)::int - 1, gen_random_uuid()) $$,
  'P0001', 'PAST_PLANNING_YEAR'
);

select results_eq(
  $$ select count(*) from public.annual_plan_revisions where owner_id = :'other_user' and status = 'draft_owner_only' $$,
  $$ values (0::bigint) $$,
  'another user cannot see private drafts'
);
```

Also assert one cycle per Brand × Year, one active workflow per cycle, nonnegative quantities/prices, stable wave surviving revisions and hard-delete rejection after proposal/operational use.

- [ ] **Step 2: Run DB tests and verify RED**

Run: `pnpm test:db:local`

- [ ] **Step 3: Implement core tables**

Use enums:

```sql
create type public.annual_plan_status as enum (
  'draft_owner_only','pending_executive','approved','changes_requested','rejected','withdrawn','superseded'
);
create type public.purchase_wave_status as enum (
  'planned','ordered','supplier_confirmed','received','cancelled'
);
```

Store month fields as `date` constrained to `date_trunc('month', value)::date` at DB level, while API exposes `YYYY-MM`. `annual_plan_lines` stores `ex_price numeric(18,6)`, paid qty, expected FOC and opening stock. Amount is a generated/stable calculation from paid qty only. `purchase_waves` owns stable identity; revision tables own month/plan snapshots.

- [ ] **Step 4: Implement owner-only RLS and command functions**

Draft policies require `owner_id = auth.uid()`. Pending policies expose only submitter and exact assigned executive. Approved policies require `view_approved_plan` brand capability. Commands lock cycle/revision rows, verify lock version and write audit/idempotency.

- [ ] **Step 5: Verify database behavior**

Run: `pnpm test:db:local && pnpm check:secrets`

Expected: V2 annual core and all pre-existing DB tests PASS. If a legacy test conflicts by design, keep it green until Task 17 removes that legacy surface.

- [ ] **Step 6: Reviewer gate and conditional checkpoint commit**

Require database/security review of draft privacy, active-workflow uniqueness and stable PO deletion guard. With authority, commit `feat(db): add annual planning v2 core`.

---

### Task 6: Implement Annual Plan Calculations and Step Gates

**Files:**
- Create: `src/features/annual-plans/domain/calculations.ts`
- Create: `src/features/annual-plans/domain/validation.ts`
- Test: `tests/unit/annual-plans/calculations.test.ts`
- Test: `tests/unit/annual-plans/validation.test.ts`
- Test: `tests/unit/annual-plans/properties.test.ts`

**Interfaces:**
- Produces `calculateAnnualLine()`, `summarizeAllocations()`, `validateScopeStep()`, `validateAnnualLinesStep()`, `validatePurchaseWavesStep()`.
- Consumes Task 1 DTOs and Decimal.js.

- [ ] **Step 1: Write deterministic and property-based RED tests**

```ts
expect(calculateAnnualLine({ exPrice: "1.75", paidQty: 10511, expectedFoc: 250, openingStock: 1790 })).toEqual({
  totalReceipts: 10761,
  plannedAmount: "18394.25",
});

fc.assert(fc.property(nonNegativeInt, nonNegativeInt, (paid, foc) => {
  expect(calculateAnnualLine({ exPrice: "0", paidQty: paid, expectedFoc: foc, openingStock: 0 }).totalReceipts)
    .toBe(paid + foc);
}));
```

Allocation tests must fail independently for Qty mismatch, FOC mismatch, unknown SKU, duplicate SKU/wave and invalid month order.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/annual-plans`

- [ ] **Step 3: Implement pure Decimal-based calculations**

Never use binary floating point for money. Normalize result to two decimal places for amount and preserve six decimals for Ex Price input. Validation returns:

```ts
export interface StepValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
  summary: Array<{ code: string; message: string; severity: "error" | "warning" }>;
}
```

- [ ] **Step 4: Run unit, mutation-sensitive assertions and typecheck**

Run: `pnpm vitest run tests/unit/annual-plans && pnpm typecheck`

Expected: all PASS; changing Qty to Qty+FOC in amount calculation must make tests fail.

- [ ] **Step 5: Reviewer gate and conditional checkpoint commit**

Review that validation does not duplicate authorization or DB state transitions. With authority, commit `feat(v2): add annual plan calculations and gates`.

---

### Task 7: Build the Four-Step Annual Plan Shell and Scope Step

**Files:**
- Create: `src/features/annual-plans/server/load-annual-plan.ts`
- Create: `src/features/annual-plans/components/annual-plan-wizard.tsx`
- Create: `src/features/annual-plans/components/annual-plan-stepper.tsx`
- Create: `src/features/annual-plans/components/annual-plan-scope-step.tsx`
- Create: `src/app/(app)/annual-plans/page.tsx`
- Create: `src/app/(app)/annual-plans/new/page.tsx`
- Create: `src/app/(app)/annual-plans/[revisionId]/page.tsx`
- Create: `src/app/api/v2/annual-plans/route.ts`
- Create: `src/app/api/v2/annual-plans/[revisionId]/scope/route.ts`
- Modify: `src/app/styles/planning.css`
- Modify: `src/app/styles/responsive.css`
- Test: `tests/components/annual-plans/annual-plan-wizard.test.tsx`
- Test: `tests/unit/annual-plans/annual-plan-routes.test.ts`

**Interfaces:**
- Consumes annual-plan commands from Task 5, step validation from Task 6 and master-data modal callbacks from Task 4.
- Produces `AnnualPlanWizardDTO` and URL contract `?step=scope|lines|waves|review`.

- [ ] **Step 1: Write RED route and component tests**

Test that past years are absent, current/future years are present, unauthorized brands are absent, new-brand modal updates the selector, an owner resumes their draft, another user sees only a generic “chu kỳ đang được chuẩn bị” conflict, and the `Tiếp tục` button stays disabled until scope is valid.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/components/annual-plans/annual-plan-wizard.test.tsx tests/unit/annual-plans/annual-plan-routes.test.ts`

- [ ] **Step 3: Implement server-only loader and safe DTO**

```ts
export interface AnnualPlanWizardDTO {
  revision: { id: string; cycleId: string; ownerId: string; status: AnnualPlanStatus; lockVersion: number };
  scope: { brand: BrandOptionDTO; planningYear: number };
  allowedSteps: Array<"scope" | "lines" | "waves" | "review">;
  saveState: "saved" | "saving" | "error";
}
```

The loader must authorize internally, return only owner draft data, and use parallel queries for independent option/summary data.

- [ ] **Step 4: Implement the selected horizontal stepper**

Desktop displays four labels across the content width. Mobile displays `Bước X/4`, current-step name and a progress bar. The sticky footer contains `Lưu nháp và thoát`, Back and Next. URL changes preserve `revisionId`; inaccessible future steps redirect to the first invalid step.

- [ ] **Step 5: Implement create/resume and autosave scope routes**

Use Task 1 error contract, an idempotency key for create/resume and lock version for scope save. Return `409` with current canonical DTO on optimistic conflict.

- [ ] **Step 6: Verify shell behavior**

Run: `pnpm vitest run tests/components/annual-plans tests/unit/annual-plans && pnpm lint && pnpm typecheck && pnpm build`

- [ ] **Step 7: Reviewer gate and conditional checkpoint commit**

Review draft privacy, no data leakage in conflict copy, focus order and responsive stepper. With authority, commit `feat(v2): add annual plan wizard shell`.

---

### Task 8: Implement Annual SKU Entry and Inline SKU Creation

**Files:**
- Create: `src/features/annual-plans/components/annual-lines-step.tsx`
- Create: `src/features/annual-plans/components/annual-line-row.tsx`
- Create: `src/app/api/v2/annual-plans/[revisionId]/lines/route.ts`
- Test: `tests/components/annual-plans/annual-lines-step.test.tsx`
- Test: `tests/unit/annual-plans/annual-lines-route.test.ts`

**Interfaces:**
- Consumes `ProductOptionDTO`, `ProductModal`, `calculateAnnualLine()` and `save_annual_plan_lines_v2()`.
- Produces a controlled row model keyed by stable `clientRowId` and canonical server line IDs.

- [ ] **Step 1: Write RED tests for row behavior**

Cover selecting only products from the active brand, adding a new SKU, uppercase canonical response, paid Qty/FOC/opening stock validation, automatic total receipts/amount, row add/remove, duplicate SKU prevention, SKU-name ellipsis with full hover/focus disclosure and autosave conflict preservation.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/components/annual-plans/annual-lines-step.test.tsx tests/unit/annual-plans/annual-lines-route.test.ts`

- [ ] **Step 3: Implement the accessible row editor**

Use a semantic table at desktop and labeled row cards at mobile. SKU/name receives flexible width; numeric columns use `inline-size: max-content`, right alignment and tabular numbers. The full product name is exposed by a focusable tooltip, not a mouse-only `title` attribute.

- [ ] **Step 4: Implement batch autosave route**

The request schema is:

```ts
const saveAnnualLinesSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
  lines: z.array(annualLineInputSchema).min(1),
  idempotencyKey: z.string().uuid(),
});
```

Authorize owner draft, resolve canonical product IDs, recalculate amount server-side and return all line DTOs plus the new lock version. Never trust client-derived amount/total receipts.

- [ ] **Step 5: Verify affected tests and a11y semantics**

Run: `pnpm vitest run tests/components/annual-plans tests/unit/annual-plans tests/components/ui/truncated-text.test.tsx && pnpm lint && pnpm typecheck`

- [ ] **Step 6: Reviewer gate and conditional checkpoint commit**

Review numeric parsing, canonical SKU handling and keyboard tooltip. With authority, commit `feat(v2): add annual SKU planning step`.

---

### Task 9: Implement Purchase-Wave Allocation Matrix

**Files:**
- Create: `src/features/annual-plans/components/purchase-wave-step.tsx`
- Create: `src/features/annual-plans/components/purchase-wave-editor.tsx`
- Create: `src/features/annual-plans/components/allocation-matrix.tsx`
- Create: `src/app/api/v2/annual-plans/[revisionId]/waves/route.ts`
- Test: `tests/components/annual-plans/purchase-wave-step.test.tsx`
- Test: `tests/unit/annual-plans/purchase-wave-route.test.ts`

**Interfaces:**
- Consumes annual lines and `validatePurchaseWavesStep()`.
- Produces `PurchaseWaveDraftDTO[]` with stable wave IDs, `YYYY-MM` months and per-product Qty/FOC.

```ts
export interface PurchaseWaveDraftDTO {
  id: string;
  sequence: number;
  name: string;
  orderMonth: string;
  arrivalMonth: string;
  status: "planned" | "ordered" | "supplier_confirmed" | "received" | "cancelled";
  allocations: Array<{ productId: string; paidQty: number; focQty: number; amount: string }>;
  canDelete: boolean;
}
```

- [ ] **Step 1: Write RED matrix tests**

Test add/remove wave, unlimited wave count, order/arrival month validation, sticky SKU column, keyboard cell navigation, automatic amount, remaining Qty/FOC summary, blocking under/over allocation and mobile SKU/PO cards.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/components/annual-plans/purchase-wave-step.test.tsx tests/unit/annual-plans/purchase-wave-route.test.ts`

- [ ] **Step 3: Implement stable wave editor and matrix**

New waves receive client IDs until server returns stable IDs. Removing an unused draft wave deletes its revision row; a wave with operational/proposal references renders a cancel action instead of delete. Display per-SKU footer values `Đã phân bổ / Kế hoạch năm / Còn lại` for Qty and FOC independently.

- [ ] **Step 4: Implement atomic save route**

Parse API months to first-day dates only at the DB boundary as a storage representation, while DTO and UI remain `YYYY-MM`. The route must reject duplicate wave sequence, duplicate product allocation and mismatched active brand/cycle. The DB command replaces the draft revision snapshot atomically and returns the canonical stable IDs.

- [ ] **Step 5: Verify calculations, UI and build**

Run: `pnpm vitest run tests/unit/annual-plans tests/components/annual-plans && pnpm lint && pnpm typecheck && pnpm build`

- [ ] **Step 6: Reviewer gate and conditional checkpoint commit**

Review stable ID rules, month semantics and matrix responsiveness. With authority, commit `feat(v2): add purchase wave allocation matrix`.

---

### Task 10: Submit and Approve Annual Plans

**Files:**
- Create: `supabase/migrations/20260817000400_v2_annual_plan_approval.sql`
- Create: `supabase/tests/database/v2_annual_plan_approval.test.sql`
- Create: `src/features/annual-plans/components/annual-plan-review.tsx`
- Create: `src/features/annual-plans/components/annual-plan-history.tsx`
- Create: `src/features/annual-plans/components/annual-plan-diff.tsx`
- Create: `src/features/annual-plans/components/create-revision-button.tsx`
- Create: `src/app/(app)/annual-plans/[revisionId]/history/page.tsx`
- Create: `src/app/api/v2/annual-plans/[revisionId]/submit/route.ts`
- Create: `src/app/api/v2/annual-plans/[revisionId]/decision/route.ts`
- Create: `src/app/api/v2/annual-plans/[revisionId]/revision/route.ts`
- Modify: `src/features/approvals/server/load-approval-inbox.ts`
- Modify: `src/features/approvals/components/approval-inbox.tsx`
- Modify: `src/app/(app)/approvals/page.tsx`
- Test: `tests/components/annual-plans/annual-plan-review.test.tsx`
- Test: `tests/components/annual-plans/annual-plan-history.test.tsx`
- Test: `tests/unit/annual-plans/annual-plan-approval-routes.test.ts`

**Interfaces:**
- Produces generic V2 tables `workflow_approval_cases`, `workflow_approval_steps`, `workflow_approval_decisions` used again by proposals/cancellations.
- Produces DB commands `submit_annual_plan_v2(uuid,integer,uuid)`, `decide_annual_plan_v2(uuid,text,text,uuid)` and `request_annual_plan_changes_v2(uuid,text,uuid)`.
- Produces review summary and exact assigned Executive DTO.

- [ ] **Step 1: Write RED pgTAP and UI tests**

Assert Manager submit routes only to assigned Executive; unrelated Executive cannot see/decide; Executive creator auto-approves; allocation mismatch blocks at DB even if UI is bypassed; request-changes creates an owner revision; approved revision supersedes previous baseline; idempotent replay returns the same result. History tests must show Vietnamese statuses, immutable prior approvers, SKU/wave/month/Qty/FOC differences, and prevent revision creation from a non-approved source.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm test:db:local && pnpm vitest run tests/components/annual-plans/annual-plan-review.test.tsx tests/unit/annual-plans/annual-plan-approval-routes.test.ts`

- [ ] **Step 3: Implement transaction-safe approval commands**

Create generic workflow approval case/step/decision tables with immutable target kind/ID, route snapshot, assignee, status and append-only decisions. Submission locks cycle/revision, revalidates every line/allocation, snapshots assigned Executive and writes audit/outbox. Executive self-approval performs submit+approve atomically. Decision checks exact assignee and current status. Request changes creates a new draft owned by the original submitter and keeps the prior request immutable.

- [ ] **Step 4: Implement review UI and inbox integration**

Render scope, budget, SKU totals, wave schedule, errors and warnings. Manager primary action is `Hoàn tất & gửi CEO/BOD duyệt`; Executive primary action is `Hoàn tất & phê duyệt`. Confirmation dialog states the exact recipient/effect and follows focus-management requirements. The history route lists revisions newest-first, exposes an accessible structured diff, and offers `Tạo phiên bản điều chỉnh` only from the current approved baseline; the new private draft copies stable wave IDs and all baseline lines/allocations.

- [ ] **Step 5: Verify annual plan vertical slice**

Run: `pnpm test:db:local && pnpm vitest run tests/unit/annual-plans tests/components/annual-plans tests/components/approvals && pnpm lint && pnpm typecheck && pnpm build`

- [ ] **Step 6: Reviewer gate and conditional checkpoint commit**

Perform separate spec and security reviews of the complete annual-plan slice. With authority, commit `feat(v2): submit and approve annual plans`.

---

### Task 11: Replace Legacy Import with Generated Excel Template

**Files:**
- Create: `supabase/migrations/20260817000500_v2_excel_checkpoints.sql`
- Create: `supabase/tests/database/v2_excel_import.test.sql`
- Create: `src/features/annual-plans/excel/template.ts`
- Create: `src/features/annual-plans/excel/parser.ts`
- Create: `src/features/annual-plans/excel/validation.ts`
- Create: `src/features/annual-plans/components/excel-import-dialog.tsx`
- Create: `src/app/api/v2/annual-plans/[revisionId]/excel-template/route.ts`
- Create: `src/app/api/v2/annual-plans/[revisionId]/excel-preview/route.ts`
- Create: `src/app/api/v2/annual-plans/[revisionId]/excel-apply/route.ts`
- Test: `tests/unit/annual-plans/excel-template.test.ts`
- Test: `tests/unit/annual-plans/excel-parser.test.ts`
- Test: `tests/components/annual-plans/excel-import-dialog.test.tsx`
- Test: `tests/fixtures/purchase-planning-v2-workbook.ts`

**Interfaces:**
- Produces workbook template version `SAGEN_PURCHASE_PLAN_V2_1`.
- Produces `ExcelPreviewDTO` and DB command `apply_annual_plan_excel_v2(uuid,integer,uuid,text,jsonb,uuid)`.
- Consumes annual calculation/validation and canonical SKU lookup.

```ts
export interface ExcelPreviewDTO {
  importSessionId: string;
  checksum: string;
  templateVersion: "SAGEN_PURCHASE_PLAN_V2_1";
  brand: { id: string; code: string; name: string };
  planningYear: number;
  lines: Array<{ productId: string | null; sku: string; name: string; exPrice: string; paidQty: number; expectedFoc: number; openingStock: number; isNew: boolean }>;
  waves: PurchaseWaveDraftDTO[];
  diagnostics: Array<{ sheet: string; row: number; column: string; code: string; severity: "error" | "warning"; message: string }>;
  canApply: boolean;
}
```

- [ ] **Step 1: Write RED workbook and preview tests**

Verify exactly two visible business sheets (`Kế hoạch SKU`, `Phân bổ PO`), hidden metadata, brand/year binding, no macro acceptance, no external links, formula values ignored, localized cell diagnostics, canonical aliases, preview without business writes, replace confirmation, checkpoint restore and same-file idempotency.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/annual-plans/excel-template.test.ts tests/unit/annual-plans/excel-parser.test.ts tests/components/annual-plans/excel-import-dialog.test.tsx`

- [ ] **Step 3: Implement deterministic template generation**

The SKU sheet columns are `SKU`, `Tên sản phẩm`, `Đơn giá xuất khẩu (Ex Price)`, `Số lượng mua`, `FOC dự kiến`, `Tồn đầu kỳ`. The PO sheet columns are `Mã PO`, `Tháng đặt`, `Tháng hàng về`, `SKU`, `Số lượng`, `FOC`. Protect computed/helper cells, add SKU validation list and store metadata in a very-hidden sheet/custom property.

- [ ] **Step 4: Implement parser and localized validation**

Accept only `.xlsx` with the exact version/schema/brand/year metadata. Reject duplicate rows, unknown inactive SKU without a name for creation, invalid decimal/quantity/month and allocations that do not reconcile. Return diagnostics shaped as `{sheet,row,column,code,severity,message}`.

- [ ] **Step 5: Implement preview/apply/checkpoint flow**

Preview stores only staging/checksum/diagnostics. Apply requires owner draft, matching lock version, explicit `replaceSections: ["lines","waves"]`, checkpoint creation and idempotency; then calls the same canonical save logic used by manual entry. Restore is owner-only and audited.

- [ ] **Step 6: Verify Excel vertical slice**

Run: `pnpm test:db:local && pnpm vitest run tests/unit/annual-plans tests/components/annual-plans && pnpm lint && pnpm typecheck && pnpm build`

- [ ] **Step 7: Reviewer gate and conditional checkpoint commit**

Review workbook compatibility, parser security and parity with manual entry. With authority, commit `feat(v2): add generated annual plan Excel import`.

---

### Task 12: Add Proposal, Approval Policy and Capacity Reservation Core

**Files:**
- Create: `supabase/migrations/20260817000600_v2_purchase_proposals.sql`
- Create: `supabase/tests/database/v2_purchase_proposals.test.sql`
- Create: `supabase/tests/database/v2_proposal_capacity_concurrency.test.sql`
- Create: `src/features/proposals/domain/routing.ts`
- Create: `src/features/approvals/components/proposal-policy-editor.tsx`
- Create: `src/app/api/v2/admin/proposal-policies/route.ts`
- Modify: `src/app/(app)/admin/approval-policies/page.tsx`
- Test: `tests/unit/proposals/routing.test.ts`
- Test: `tests/unit/proposals/properties.test.ts`
- Test: `tests/components/approvals/proposal-policy-editor.test.tsx`
- Test: `tests/unit/approvals/v2-proposal-policy-route.test.ts`

**Interfaces:**
- Produces tables `purchase_proposals`, `proposal_revisions`, `proposal_lines`, `proposal_route_snapshots`, `capacity_reservations`.
- Produces commands `create_or_resume_proposal_v2`, `save_proposal_v2`, `submit_proposal_v2`, `assign_proposal_wave_v2`, `decide_proposal_v2`, `withdraw_proposal_v2`, `request_proposal_cancellation_v2`.
- Produces `deriveProposalRoute(input): "manager_only" | "manager_then_executive"`.

- [ ] **Step 1: Write RED routing and pgTAP tests**

Test default two-level, threshold one/two-level, exact-threshold escalation, any-line over-plan escalation, conservative reference value `requested × baseline Ex Price`, assigned Manager/Executive snapshot, Leader without baseline visibility, approved-plan/active-wave prerequisite, one proposal/one wave, and cancellation release only after approval.

Policy UI/route tests must cover applying one policy to multiple authorized brands, preventing overlapping effective policies, default forced-two-level summary, threshold currency/value validation and canonical server reconciliation after save.

- [ ] **Step 2: Write RED concurrency test**

Use two database sessions/transactions targeting the same wave/SKU. The test must show only one proposal can consume remaining planned capacity without the other being reclassified over-plan. A one-level proposal that becomes over-plan at decision must transition to Executive with Manager L1 recorded.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm test:db:local && pnpm vitest run tests/unit/proposals`

- [ ] **Step 4: Implement proposal schema and RLS**

Proposal drafts are owner-only. Pending rows are visible to submitter and exact current assignee. `proposal_lines` stores requested units; route snapshot stores baseline revision, Ex Price, planned/remaining capacity, reference amount, selected stable wave, policy and escalation reasons. Capacity reservation rows are unique per active proposal/wave/product and protected by transaction locks.

- [ ] **Step 5: Implement policy and decision commands**

Reuse/replace legacy approval policy data with V2 policy semantics: `forced_two_level` or `threshold`, default forced two-level, multi-brand assignment and over-plan override. The Admin editor uses a guided three-section form (brands, routing mode/threshold, effective dates) plus a sticky confirmation summary; it saves through the versioned route and focuses the first invalid field. Manager self-proposal records L1 automatically; Executive proposal approves atomically. Every decision writes audit/outbox and respects idempotency.

- [ ] **Step 6: Verify proposal core**

Run: `pnpm test:db:local && pnpm vitest run tests/unit/proposals tests/components/approvals/proposal-policy-editor.test.tsx tests/unit/approvals/v2-proposal-policy-route.test.ts && pnpm check:secrets`

- [ ] **Step 7: Reviewer gate and conditional checkpoint commit**

Require concurrency/security review of capacity and exact-assignee RLS. With authority, commit `feat(db): add purchase proposal workflow`.

---

### Task 13: Build Proposal Creation, PO Assignment and Decision UI

**Files:**
- Create: `src/features/proposals/server/load-proposals.ts`
- Create: `src/features/proposals/components/proposal-list.tsx`
- Create: `src/features/proposals/components/proposal-form.tsx`
- Create: `src/features/proposals/components/proposal-review.tsx`
- Create: `src/features/proposals/components/wave-assignment-panel.tsx`
- Create: `src/app/(app)/proposals/page.tsx`
- Create: `src/app/(app)/proposals/new/page.tsx`
- Create: `src/app/(app)/proposals/[proposalId]/page.tsx`
- Create: `src/app/api/v2/proposals/route.ts`
- Create: `src/app/api/v2/proposals/[proposalId]/submit/route.ts`
- Create: `src/app/api/v2/proposals/[proposalId]/assign-wave/route.ts`
- Create: `src/app/api/v2/proposals/[proposalId]/decision/route.ts`
- Create: `src/app/api/v2/proposals/[proposalId]/request-changes/route.ts`
- Create: `src/app/api/v2/proposals/[proposalId]/withdraw/route.ts`
- Create: `src/app/api/v2/proposals/[proposalId]/cancellation/route.ts`
- Test: `tests/components/proposals/proposal-form.test.tsx`
- Test: `tests/components/proposals/proposal-review.test.tsx`
- Test: `tests/unit/proposals/proposal-routes.test.ts`

**Interfaces:**
- Consumes Task 12 proposal commands and Task 2 organization context.
- Produces owner/approver DTOs that intentionally omit baseline quantities for a Leader lacking `view_approved_plan`.

- [ ] **Step 1: Write RED proposal form tests**

Cover eligible brand/year only, at least one active wave, multi-SKU positive quantities, needed month, reason, private draft autosave, no Ex Price/FOC/value fields for Leader, and a no-plan message that tells the user to contact Manager without creating an outside-plan PO.

- [ ] **Step 2: Write RED Manager review tests**

Cover suggested waves with arrival month ≤ needed month, later-wave warning, one-wave-only assignment, remaining-capacity disclosure, any-line over-plan banner, forced L2 copy, Manager self-approval and API error retention in the confirmation dialog. Request-changes tests must assert required comments, immutable prior revision/decisions and a new private revision owned by the original submitter.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm vitest run tests/components/proposals tests/unit/proposals`

- [ ] **Step 4: Implement server-safe proposal DTOs and routes**

`loadProposalForViewer(id)` branches by owner/current assignee/capability and returns a minimal DTO. The Leader DTO excludes baseline price/quantities/capacity. Every route validates Task 1 schemas, authorizes independently and maps domain errors through `ApiFailure`.

- [ ] **Step 5: Implement creation and review screens**

Use a simple multi-line editor for proposal creation. Manager review shows requested units, wave suggestions, selected-wave capacity before/after, route preview and exact Executive. `Yêu cầu chỉnh sửa` calls the dedicated route and returns the new revision deep link to the submitter. Decision/cancellation dialogs trap focus, support Escape/return and preserve user input on retryable errors.

- [ ] **Step 6: Verify proposal UI and affected approval tests**

Run: `pnpm vitest run tests/components/proposals tests/unit/proposals tests/components/approvals tests/unit/approvals && pnpm lint && pnpm typecheck && pnpm build`

- [ ] **Step 7: Reviewer gate and conditional checkpoint commit**

Review Leader data minimization and route recomputation at decision. With authority, commit `feat(v2): add purchase proposal experience`.

---

### Task 14: Add Transactional Notification Center

**Files:**
- Create: `supabase/migrations/20260817000700_v2_notifications.sql`
- Create: `supabase/tests/database/v2_notifications.test.sql`
- Create: `src/features/notifications/contracts.ts`
- Create: `src/features/notifications/server/load-notifications.ts`
- Create: `src/features/notifications/server/dispatch-after-response.ts`
- Create: `src/features/notifications/components/notification-bell.tsx`
- Create: `src/features/notifications/components/notification-center.tsx`
- Create: `src/app/(app)/notifications/page.tsx`
- Create: `src/app/api/v2/notifications/[notificationId]/read/route.ts`
- Modify: `src/app/(app)/layout.tsx`
- Test: `tests/components/notifications/notification-center.test.tsx`
- Test: `tests/unit/notifications/notification-route.test.ts`

**Interfaces:**
- Produces `notification_outbox`, `notifications`, `enqueue_notification_v2(uuid,uuid,text,text,text,text)` and `dispatch_notification_outbox_v2(uuid)`.
- Consumes outbox writes already called by annual-plan/proposal commands.

```ts
export interface NotificationDTO {
  id: string;
  category: "annual_plan" | "proposal" | "cancellation" | "system";
  title: string;
  body: string;
  href: string;
  createdAt: string;
  readAt: string | null;
}
```

- [ ] **Step 1: Write RED DB and UI tests**

Assert outbox is rolled back when business transaction fails; annual-plan submit notifies exact Executive; one-level proposal informs Executive; two-level proposal requests Executive action; withdraw informs current approver; owner receives change/reject/approve/cancel result; only recipient can read/mark read.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm test:db:local && pnpm vitest run tests/components/notifications tests/unit/notifications`

- [ ] **Step 3: Implement outbox and notification RLS**

Outbox rows are server/command writable only. Dispatcher is idempotent on outbox ID and creates recipient notification with Vietnamese title/body, category, unread timestamp and allowlisted internal deep link. Recipient-only RLS applies to notifications. Each successful command route calls `after(() => dispatchPendingNotifications(correlationId))`; dispatch failure leaves the outbox row pending for the next command/page-load retry and never rolls back the completed business transaction.

- [ ] **Step 4: Implement bell and notification page**

Bell shows unread count, keyboard-accessible popover and link to full history. Mark-read uses optimistic UI with rollback on error. Deep links resolve only to routes the recipient can access.

- [ ] **Step 5: Verify notifications and command integration**

Run: `pnpm test:db:local && pnpm vitest run tests/components/notifications tests/unit/notifications tests/unit/annual-plans tests/unit/proposals && pnpm lint && pnpm typecheck`

- [ ] **Step 6: Reviewer gate and conditional checkpoint commit**

Review outbox atomicity, recipient privacy and open-redirect prevention. With authority, commit `feat(v2): add in-app notifications`.

---

### Task 15: Build Role-Aware Dashboard, Navigation and PO Operations

**Files:**
- Create: `supabase/migrations/20260817000800_v2_dashboard_projections.sql`
- Create: `supabase/tests/database/v2_dashboard_projections.test.sql`
- Create: `src/features/dashboard/contracts.ts`
- Create: `src/features/dashboard/server/load-role-dashboard.ts`
- Create: `src/features/dashboard/components/role-dashboard.tsx`
- Create: `src/features/dashboard/components/action-summary.tsx`
- Create: `src/features/dashboard/components/plan-health-metrics.tsx`
- Create: `src/features/dashboard/components/purchase-wave-progress.tsx`
- Create: `src/features/dashboard/components/exception-list.tsx`
- Create: `src/features/dashboard/server/export-approved-plan.ts`
- Create: `src/features/annual-plans/components/purchase-wave-operations.tsx`
- Create: `src/app/(app)/purchase-waves/page.tsx`
- Create: `src/app/(app)/purchase-waves/[waveId]/page.tsx`
- Create: `src/app/api/v2/purchase-waves/[waveId]/operations/route.ts`
- Create: `src/app/api/v2/reports/approved-plan/route.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/navigation/navigation-model.ts`
- Modify: `src/components/ui/app-sidebar.tsx`
- Modify: `src/components/navigation/mobile-navigation.tsx`
- Modify: `src/app/styles/dashboard.css`
- Modify: `src/app/styles/app-shell.css`
- Modify: `src/app/styles/responsive.css`
- Test: `tests/components/dashboard/role-dashboard.test.tsx`
- Test: `tests/unit/dashboard/dashboard-projections.test.ts`
- Test: `tests/unit/dashboard/export-approved-plan.test.ts`
- Test: `tests/components/navigation/v2-navigation.test.tsx`

**Interfaces:**
- Produces `loadRoleDashboard(context, brandId, year): Promise<RoleDashboardDTO>`.
- Produces PO status command for `planned → ordered → supplier_confirmed → received`, plus controlled cancellation.

```ts
export interface RoleDashboardDTO {
  context: { brandId: string | null; brandCode: string | null; planningYear: number | null; tier: OrgTier };
  actions: Array<{ id: string; kind: "approval" | "late_wave" | "over_plan" | "private_draft"; title: string; detail: string; href: string; dueLabel: string | null }>;
  metrics: Array<{ key: "baseline" | "allocated" | "approved_proposals" | "over_plan"; label: string; amount: string; context: string; progress: number | null }>;
  waves: Array<{ id: string; name: string; arrivalMonth: string; usedUnits: number; plannedUnits: number; progress: number; status: string }>;
  exceptions: Array<{ id: string; severity: "critical" | "warning" | "info"; title: string; detail: string; href: string }>;
  canViewBaseline: boolean;
}
```

- [ ] **Step 1: Write RED projection/privacy tests**

Assert only approved baseline contributes to metrics; draft/pending do not. Approved proposals and active reservations produce usage/over-plan values. Leader without view capability gets only own proposal/action DTO. Manager gets team/action/PO data; Executive gets portfolio; Administrator gets governance signals.

- [ ] **Step 2: Write RED UI/navigation tests**

Verify three-second hierarchy: actionable items first, four contextual metrics, wave progress and exceptions. Navigation contains Vietnamese labels, preserves authorized brand/year context, has exactly one `aria-current`, hides unauthorized modules and never renders legacy `Import dữ liệu` or `Forecast` wording.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm test:db:local && pnpm vitest run tests/components/dashboard tests/unit/dashboard tests/components/navigation`

- [ ] **Step 4: Implement security-invoker projections and loader**

Create narrow SQL views/functions for approved baseline, wave planned capacity, active reservation/approved proposal usage and exceptions. Index cycle/brand/year/status, wave/status and proposal/assignee/status. Loader runs independent projections in parallel and emits only the role-specific DTO.

- [ ] **Step 5: Implement dashboard and PO operations**

Use the approved visual structure: compact heading, context selectors, separated 12px-radius cards with ≥16px gaps, action-first band, contextual metrics, wave progress and exception list. PO details permit official PO number/exact dates/status only to authorized Manager/Executive and preserve plan-month comparison. Cancelling a wave with active proposals requires selecting a replacement stable wave for every active proposal in the same transaction; otherwise the route returns `409 ACTIVE_PROPOSAL_REASSIGNMENT_REQUIRED`.

The approved-plan export route authorizes `view_approved_plan`, exports only the selected approved baseline plus permitted operational summaries, recalculates Amount server-side and names the workbook `Sagen_<brand>_<year>_Ke_hoach_mua_hang.xlsx`.

- [ ] **Step 6: Implement final navigation model**

Navigation groups are `Công việc`, `Kế hoạch & thực hiện`, `Hệ thống`. Links are capability-filtered and preserve validated brand/year query. Active matching includes query-sensitive subroutes without two simultaneous active links.

- [ ] **Step 7: Verify dashboard, navigation and build**

Run: `pnpm test:db:local && pnpm vitest run tests/components/dashboard tests/unit/dashboard tests/components/navigation tests/unit/navigation && pnpm lint && pnpm typecheck && pnpm build`

- [ ] **Step 8: Reviewer gate and conditional checkpoint commit**

Run a product/UX review plus a privacy review of each role DTO. With authority, commit `feat(v2): add role-aware operations dashboard`.

---

### Task 16: Apply Sagen Design System and Accessibility Acceptance

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/styles/app-shell.css`
- Modify: `src/app/styles/administration.css`
- Modify: `src/app/styles/planning.css`
- Modify: `src/app/styles/dashboard.css`
- Modify: `src/app/styles/responsive.css`
- Modify: `src/components/ui/page-header.tsx`
- Modify: `src/components/ui/truncated-text.tsx`
- Reuse: `public/brand/sagen-symbol.png`
- Reuse: `public/brand/sagen-wordmark.png`
- Test: `tests/unit/ui/v2-sagen-design-contract.test.ts`
- Test: `tests/unit/ui/v2-responsive-boundary.test.ts`
- Test: `tests/components/accessibility/v2-dialogs-and-tables.test.tsx`
- Test: `tests/e2e/v2-responsive-accessibility.spec.ts`

**Interfaces:**
- Produces global tokens and reusable behaviors consumed by all V2 screens.
- Consumes approved Sagen assets and UI requirements from the spec.

- [ ] **Step 1: Write RED static and behavior tests**

Assert Be Vietnam Pro body and Lora heading setup, Sagen assets, no MegaMat tokens/assets, no desktop page title above 40px, ≥16px dashboard card gaps, active-nav marker, 44px mobile targets, WCAG AA token contrast, SKU truncation/focus tooltip, dialog focus cycle/Escape/return and reduced-motion override.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/unit/ui/v2-sagen-design-contract.test.ts tests/unit/ui/v2-responsive-boundary.test.ts tests/components/accessibility/v2-dialogs-and-tables.test.tsx`

- [ ] **Step 3: Implement font and token contract**

Use `next/font` with Vietnamese subsets or local font assets; do not manually preload unused font files. Define CSS custom properties for off-white, charcoal, Champagne Gold and semantic status colors. Remove legacy cascade blocks that override V2 module styles.

- [ ] **Step 4: Normalize components and responsive behavior**

Headers use 32–40px desktop and 26–32px mobile. Cards use 10–12px radius, thin border and light/no shadow. Tables keep SKU/name flexible and numbers max-content/right-aligned. Complex matrices become SKU/PO cards on narrow screens. Every dialog and mobile drawer implements focus management.

- [ ] **Step 5: Run component, build and Playwright accessibility checks**

Run: `pnpm vitest run tests/unit/ui tests/components/accessibility tests/components/ui && pnpm lint && pnpm typecheck && pnpm build && pnpm exec playwright test tests/e2e/v2-responsive-accessibility.spec.ts --project=chromium`

- [ ] **Step 6: Reviewer gate and conditional checkpoint commit**

Review at desktop/tablet/mobile with real Vietnamese strings and keyboard only. With authority, commit `style(v2): apply Sagen design and accessibility system`.

---

### Task 17: Real E2E, Production-Safe Data Reset and Legacy Cutover

**Files:**
- Create: `supabase/migrations/20260817000900_v2_cutover_and_business_data_reset.sql`
- Create: `supabase/tests/database/v2_cutover_guard.test.sql`
- Create: `scripts/backup-business-data.mjs`
- Create: `scripts/verify-v2-cutover.mjs`
- Create: `tests/e2e/v2-support.ts`
- Create: `tests/e2e/v2-annual-plan.spec.ts`
- Create: `tests/e2e/v2-proposal-approval.spec.ts`
- Create: `tests/e2e/v2-admin-transfer.spec.ts`
- Create: `tests/e2e/v2-excel-parity.spec.ts`
- Modify: `src/app/api/e2e/reset/route.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `src/features/auth/access-types.ts`
- Modify: `src/features/auth/permissions.ts`
- Delete after green cutover: `src/app/(app)/imports/page.tsx`
- Delete after green cutover: `src/app/api/imports/preview/route.ts`
- Delete after green cutover: `src/app/api/imports/commit/route.ts`
- Delete after green cutover: `src/features/imports/components/import-dropzone.tsx`
- Delete after green cutover: `src/features/imports/components/import-issue-list.tsx`
- Delete after green cutover: `src/features/imports/components/import-preview.tsx`
- Delete after green cutover: `src/features/imports/components/import-workflow.tsx`
- Delete after green cutover: `src/features/imports/components/sheet-selector.tsx`
- Delete after green cutover: `src/features/imports/domain/import-types.ts`
- Delete after green cutover: `src/features/imports/hooks/use-import-workflow.ts`
- Delete after green cutover: `src/features/imports/server/build-preview.ts`
- Delete after green cutover: `src/features/imports/server/detect-forecast-sheet.ts`
- Delete after green cutover: `src/features/imports/server/normalize-rows.ts`
- Delete after green cutover: `src/features/imports/server/read-workbook.ts`
- Delete after green cutover: `src/features/imports/server/validate-import.ts`
- Delete after green cutover: `src/app/(app)/planning/page.tsx`
- Delete after green cutover: `src/app/(app)/planning/[cycleId]/page.tsx`
- Delete after green cutover: `src/features/planning/components/kpi-strip.tsx`
- Delete after green cutover: `src/features/planning/components/planning-header.tsx`
- Delete after green cutover: `src/features/planning/components/planning-insights.tsx`
- Delete after green cutover: `src/features/planning/components/planning-product-editor.tsx`
- Delete after green cutover: `src/features/planning/components/planning-product-list.tsx`
- Delete after green cutover: `src/features/planning/components/planning-workflow-nav.tsx`
- Delete after green cutover: `src/features/planning/components/planning-workspace.tsx`
- Delete after green cutover: `src/features/planning/components/stock-alert.tsx`
- Delete after green cutover: `src/features/planning/contracts.ts`
- Delete after green cutover: `src/features/planning/domain/product-list.ts`
- Delete after green cutover: `src/features/planning/domain/project-plan.ts`
- Delete after green cutover: `src/features/planning/domain/recommend-po.ts`
- Delete after green cutover: `src/features/planning/hooks/use-draft-autosave.ts`
- Delete after green cutover: `src/features/planning/hooks/use-plan-presence.ts`
- Delete after green cutover: `src/features/planning/planning-types.ts`
- Delete after green cutover: `src/features/planning/server/load-planning-workspace.ts`
- Delete after green cutover: `src/app/(app)/versions/page.tsx`
- Delete after green cutover: `src/app/(app)/versions/[versionId]/page.tsx`
- Delete after green cutover: `src/features/versions/components/create-revision-button.tsx`
- Delete after green cutover: `src/features/versions/components/version-diff.tsx`
- Delete after green cutover: `src/features/versions/components/version-history.tsx`
- Delete after green cutover: `src/features/versions/domain/diff-plan.ts`
- Delete after green cutover: `src/features/reports/components/dashboard-executive-summary.tsx`
- Delete after green cutover: `src/features/reports/components/dashboard-health-cards.tsx`
- Delete after green cutover: `src/features/reports/components/dashboard-kpis.tsx`
- Delete after green cutover: `src/features/reports/components/dashboard-priority-list.tsx`
- Delete after green cutover: `src/features/reports/components/dashboard-supply-preview.tsx`
- Delete after green cutover: `src/features/reports/components/dashboard-workflow-status.tsx`
- Delete after green cutover: `src/features/reports/components/po-timeline.tsx`
- Delete after green cutover: `src/features/reports/domain/dashboard-insights.ts`
- Delete after green cutover: `src/features/reports/report-types.ts`
- Delete after green cutover: `src/features/reports/server/export-plan.ts`
- Delete after green cutover: `src/features/reports/server/load-dashboard.ts`
- Delete after green cutover: `src/app/api/planning/[planVersionId]/draft/route.ts`
- Delete after green cutover: `src/app/api/planning/[planVersionId]/revision/route.ts`
- Delete after green cutover: `src/app/api/planning/[planVersionId]/submit/route.ts`
- Delete after green cutover: `src/app/api/approvals/[requestId]/decision/route.ts`
- Delete after green cutover: `src/app/api/reports/export/route.ts`
- Delete after green cutover: `src/app/api/admin/users/access/route.ts`
- Delete after green cutover: `src/app/api/admin/approval-policies/route.ts`
- Delete after green cutover: `src/features/admin/components/user-access-manager.tsx`
- Delete after green cutover: `src/features/approvals/approval-types.ts`
- Delete after green cutover: `src/features/approvals/components/approval-review.tsx`
- Delete after green cutover: `src/features/approvals/components/policy-editor.tsx`
- Delete after green cutover: `src/features/approvals/components/policy-summary.tsx`
- Delete after green cutover: `src/features/approvals/domain/policy-summary.ts`
- Delete after green cutover: `src/features/auth/server/get-current-access.ts`
- Delete after green cutover: `tests/components/imports/import-workflow.test.tsx`
- Delete after green cutover: `tests/unit/imports/build-preview.test.ts`
- Delete after green cutover: `tests/unit/imports/commit-route.test.ts`
- Delete after green cutover: `tests/unit/imports/http-transport.test.ts`
- Delete after green cutover: `tests/unit/imports/normalize-rows.test.ts`
- Delete after green cutover: `tests/unit/imports/preview-route.test.ts`
- Delete after green cutover: `tests/unit/imports/read-workbook.test.ts`
- Delete after green cutover: `tests/unit/imports/validate-import.test.ts`
- Delete after green cutover: `tests/components/planning/autosave-conflict.test.tsx`
- Delete after green cutover: `tests/components/planning/planning-product-editor.test.tsx`
- Delete after green cutover: `tests/components/planning/planning-product-list.test.tsx`
- Delete after green cutover: `tests/components/planning/planning-workflow-nav.test.tsx`
- Delete after green cutover: `tests/components/planning/planning-workspace.test.tsx`
- Delete after green cutover: `tests/unit/planning/draft-route.test.ts`
- Delete after green cutover: `tests/unit/planning/planning-index-page.test.tsx`
- Delete after green cutover: `tests/unit/planning/planning-page-workflow.test.tsx`
- Delete after green cutover: `tests/unit/planning/product-list.test.ts`
- Delete after green cutover: `tests/unit/planning/project-plan.test.ts`
- Delete after green cutover: `tests/unit/planning/recommend-po.test.ts`
- Delete after green cutover: `tests/unit/planning/revision-route.test.ts`
- Delete after green cutover: `tests/components/reports/dashboard.test.tsx`
- Delete after green cutover: `tests/unit/reports/dashboard-insights.test.ts`
- Delete after green cutover: `tests/unit/reports/export-plan.test.ts`
- Delete after green cutover: `tests/unit/reports/export-route.test.ts`
- Delete after green cutover: `tests/components/versions/version-diff.test.tsx`
- Delete after green cutover: `tests/components/versions/version-history.test.tsx`
- Delete after green cutover: `tests/unit/versions/diff-plan.test.ts`
- Delete after green cutover: `tests/e2e/brand-access.spec.ts`
- Delete after green cutover: `tests/e2e/compact-operations-responsive.spec.ts`
- Delete after green cutover: `tests/e2e/dashboard-operations.spec.ts`
- Delete after green cutover: `tests/e2e/import-plan-approve.spec.ts`
- Delete after green cutover: `tests/e2e/navigation-responsive.spec.ts`
- Delete after green cutover: `tests/e2e/revision-conflict.spec.ts`
- Delete after green cutover: `tests/e2e/threshold-approval.spec.ts`
- Delete after green cutover: `tests/fixtures/forecast-import.synthetic.xlsx`
- Delete after green cutover: `tests/fixtures/forecast-workbook.ts`
- Preserve: all historical migration files; contract only through a new migration

**Interfaces:**
- Produces a guarded, reversible cutover and a production-like E2E harness with deterministic per-test cycles.
- Consumes all previous tasks.

- [ ] **Step 1: Write RED end-to-end scenarios using five real roles**

Seed unique accounts/data per test for Administrator, Leader, Manager, Executive and Viewer. E2E must cover:

1. Manager manual plan → exact Executive approval → approved dashboard.
2. Executive-created plan → atomic self-approval.
3. Leader without baseline view → proposal → Manager assigns PO → one-level approval → Executive info notification.
4. Over-plan proposal → Manager L1 → exact Executive L2.
5. Manager self-proposal in one/two-level routes.
6. Cancellation approval releases capacity.
7. Admin transfers Manager/Executive and pending work atomically.
8. Excel-created draft equals manual draft canonical DTO.
9. Draft privacy across all five roles.
10. Login accepts the Sagen email prefix and account creation never exposes the initial password in API/log output.

- [ ] **Step 2: Make E2E harness database-real and isolated**

`tests/e2e/v2-support.ts` creates a UUID-suffixed brand/year/cycle per scenario through authorized APIs, logs in each real seed role and registers cleanup. `/api/e2e/reset` is available only when `E2E_MODE=true`, validates a reset token and refuses any Supabase URL/project ref matching production configuration.

- [ ] **Step 3: Add backup and cutover guards before destructive SQL**

`backup-business-data.mjs` exports row counts and JSON/SQL snapshots for business tables, hashes the artifact and verifies that `admin@sagen-groupe.com` exists. The cutover migration must abort unless a session setting such as `app.v2_cutover_confirmed = 'BUSINESS_DATA_BACKED_UP'` is set by the controlled cutover script.

- [ ] **Step 4: Implement exact reset scope**

Delete/truncate in FK-safe order all legacy business/demo rows: import issues/staging/batches, demand/inventory/receipt snapshots, legacy approval steps/requests/policy assignments, version diffs, legacy purchase lines/batches, monthly demand, plan lines/versions/cycles, demo suppliers/prices/settings, products/SKU aliases, brands and related business audit rows. Preserve `auth.users` and the profile for `admin@sagen-groupe.com`; set that retained profile to tier `executive` with `administer_system`, `create_annual_plan`, `view_approved_plan`, `create_purchase_proposal` and `manage_master_data`, while leaving brand permissions empty until new brands are created. Preserve required organization rows, system configuration, action-idempotency infrastructure and migration history.

- [ ] **Step 5: Contract legacy schema and code only after E2E green**

The contract migration drops legacy tables `import_issues`, `import_staging_rows`, `import_batches`, `sales_demand`, `inventory_snapshots`, `purchased_receipts`, `source_snapshots`, `version_diffs`, `purchase_lines`, `purchase_batches`, `plan_monthly_demand`, `plan_lines`, `plan_versions`, `planning_cycles`, `approval_steps`, `approval_requests`, `approval_policy_brands`, `approval_policies`, `suppliers`, `product_prices`, `planning_settings`, `user_roles`, `roles`, `user_brand_access`; then drops their legacy triggers/functions/enums after confirming no V2 FK/view/function depends on them. Preserve `profiles`, `brands`, `products`, `sku_aliases`, `action_idempotency`, `audit_events` and all V2 tables. Remove the exact old routes/components/tests listed in this task and update README/scripts/fixtures. Do not delete historical migration files.

- [ ] **Step 6: Fix CI order and production harness evidence**

CI order must be: install → lint → typecheck → unit/coverage → DB tests → production build → secret scan of source and `.next` → `next start` production-harness 404 check → database-real Playwright. Do not start `next dev` against the same `.next` between build and secret scan.

- [ ] **Step 7: Run the full fresh verification matrix**

Run in an explicitly non-production test environment:

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

Expected: every command PASS; coverage remains above configured thresholds; Playwright runs the V2 real-role scenarios rather than mock-only fixtures.

- [ ] **Step 8: Dry-run backup, restore and cutover verification**

On the test database, run backup → reset/cutover → verify → restore rehearsal. `verify-v2-cutover.mjs` must assert zero legacy business rows, one retained Admin account, valid Admin capability, no legacy navigation/API route and successful login/dashboard access.

- [ ] **Step 9: Explicit production cutover checkpoint**

Stop before any production mutation and present: backup hash, restore rehearsal evidence, migration diff, exact retained/deleted row counts, full test evidence and rollback command. Execute production reset/migration only after the user approves that exact cutover action.

- [ ] **Step 10: Post-cutover smoke and conditional checkpoint commit**

After authorized cutover, verify Admin login, create brand/SKU, create draft, notification and dashboard read. With Git authority, commit `feat(v2): cut over purchase planning platform`; push/PR remains a separate explicit user choice.

---

## Spec Coverage Matrix

| Spec area | Implemented by |
|---|---|
| Product boundary and V2 modular architecture | Tasks 1–17 |
| Organization tier, Administrator, reporting lines and inherited scope | Tasks 2–3 |
| Admin account creation and Sagen-prefix login preservation | Tasks 3, 17 |
| Brand/SKU inline creation and canonical mapping | Task 4 |
| Private annual draft, four-step wizard and year guard | Tasks 5–10 |
| Paid Qty, FOC, Amount and allocation equality | Tasks 6, 8–9 |
| Stable PO identity and operational status | Tasks 5, 9, 15 |
| Annual-plan approval and immutable baseline | Task 10 |
| Annual-plan revision history and structured diff | Task 10 |
| Generated Excel template, preview, replace and checkpoint | Task 11 |
| Proposal workflow, exact approvers, threshold and over-plan | Tasks 12–13 |
| Multi-brand proposal approval-policy administration | Task 12 |
| Capacity reservation, cancellation and concurrency | Task 12 |
| Transactional in-app notifications | Task 14 |
| Role-aware approved-only dashboard and navigation | Task 15 |
| Approved-plan export and operational PO updates | Task 15 |
| Sagen design, Vietnamese, responsive and accessibility | Task 16 |
| Backup, data reset, legacy removal, E2E and cutover | Task 17 |

## Cross-Task Review Gates

1. After Task 4: organization/master-data security review.
2. After Task 10: complete annual-plan vertical-slice spec and security review.
3. After Task 13: proposal/concurrency review.
4. After Task 16: product/UX/accessibility review.
5. Before Task 17 production checkpoint: full code/security review and fresh verification evidence.

## Execution Notes

- Start execution in an isolated worktree only when the implementation session begins and the user authorizes that workflow.
- Keep the current dirty workspace intact; do not reset or overwrite existing user changes.
- At most one task owns a migration sequence or shared stylesheet at a time.
- A task is not complete from its implementer summary; the parent/reviewer reruns its focused evidence.
- Production database deletion is not implied by approval of this plan. Task 17 Step 9 requires a new, exact production-cutover approval.
