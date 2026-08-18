import { expect, test, type APIRequestContext, type APIResponse, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { localResetToken, login, requireLocalSupabase } from "./support";

export type V2Role =
  | "administrator"
  | "leader"
  | "manager"
  | "executive"
  | "viewer";

export const CURRENT_PLANNING_YEAR = 2026;
export const CURRENT_EFFECTIVE_DATE = "2026-08-17";

export interface AnnualLineInput {
  productId: string;
  exPrice: string;
  paidQty: number;
  expectedFoc: number;
  openingStock: number;
}

export interface PurchaseWaveInput {
  id: string;
  sequence: number;
  orderMonth: string;
  arrivalMonth: string;
  allocations: Array<{
    productId: string;
    paidQty: number;
    focQty: number;
    exPrice: string;
  }>;
}

export interface ProposalLineInput {
  productId: string;
  requestedQty: number;
}

export interface ScenarioBrand {
  id: string;
  code: string;
  name: string;
}

export interface ScenarioProduct {
  id: string;
  brandId: string;
  canonicalSku: string;
  name: string;
}

export interface OrganizationUserSnapshot {
  id: string;
  displayName: string;
  isActive: boolean;
  tier: "employee_viewer" | "leader" | "manager" | "executive";
  supervisorId: string | null;
  capabilities: string[];
  directBrands: Array<{ id: string; code: string; name: string }>;
  inheritedBrands: Array<{ id: string; code: string; name: string; sourceUserName: string }>;
  subordinateCount: number;
}

export interface AnnualPlanDraft {
  cycleId: string;
  revisionId: string;
  revisionNumber: number;
  status: string;
  lockVersion: number;
}

export interface SubmittedAnnualPlan {
  revisionId: string;
  caseId: string;
  status: string;
  assignedExecutiveId: string | null;
  autoApproved: boolean;
  lockVersion: number;
}

export interface ProposalDraft {
  proposalId: string;
  revisionId: string;
  status: string;
  lockVersion: number;
}

export interface ProposalSubmission {
  proposalId: string;
  revisionId: string;
  status: string;
  route: "manager_only" | "manager_then_executive";
  referenceAmount: string;
}

export interface ProposalAssignment {
  proposalId: string;
  status: string;
  route: "manager_only" | "manager_then_executive";
  overPlan: boolean;
  lockVersion: number;
}

interface ApiEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  correlationId?: string;
  [key: string]: unknown;
}

interface RoleSeed {
  id: string;
  email: string;
  displayName: string;
  tier: "employee_viewer" | "leader" | "manager" | "executive";
  supervisorId: string | null;
  capabilities: string[];
}

const roleSeeds: Record<V2Role, RoleSeed> = {
  administrator: {
    id: "91000000-0000-0000-0000-000000000001",
    email: "admin@sagen-groupe.com",
    displayName: "Sagen Administrator",
    tier: "executive",
    supervisorId: null,
    capabilities: [
      "administer_system",
      "create_annual_plan",
      "view_approved_plan",
      "create_purchase_proposal",
      "manage_master_data",
    ],
  },
  leader: {
    id: "91000000-0000-0000-0000-000000000002",
    email: "leader@sagen-groupe.com",
    displayName: "Sagen Leader",
    tier: "leader",
    supervisorId: "91000000-0000-0000-0000-000000000003",
    capabilities: ["create_purchase_proposal"],
  },
  manager: {
    id: "91000000-0000-0000-0000-000000000003",
    email: "manager@sagen-groupe.com",
    displayName: "Sagen Manager",
    tier: "manager",
    supervisorId: "91000000-0000-0000-0000-000000000004",
    capabilities: [
      "create_annual_plan",
      "view_approved_plan",
      "create_purchase_proposal",
    ],
  },
  executive: {
    id: "91000000-0000-0000-0000-000000000004",
    email: "executive@sagen-groupe.com",
    displayName: "Sagen Executive",
    tier: "executive",
    supervisorId: null,
    capabilities: [
      "create_annual_plan",
      "view_approved_plan",
      "create_purchase_proposal",
    ],
  },
  viewer: {
    id: "91000000-0000-0000-0000-000000000005",
    email: "viewer@sagen-groupe.com",
    displayName: "Sagen Viewer",
    tier: "employee_viewer",
    supervisorId: null,
    capabilities: ["view_approved_plan"],
  },
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12) || "scenario";
}

function randomSuffix() {
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function parseRoleEmails() {
  const configured = process.env.E2E_V2_ROLE_EMAILS;
  if (!configured) return {};
  try {
    return JSON.parse(configured) as Partial<Record<V2Role, string>>;
  } catch {
    return {};
  }
}

async function readJson(response: APIResponse) {
  const text = await response.text();
  return {
    text,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function expectStatus<T>(
  response: APIResponse,
  url: string,
  expectedStatus: number | number[],
): Promise<{ body: ApiEnvelope<T>; text: string }> {
  const { text, body } = await readJson(response);
  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  expect(
    allowed.includes(response.status()),
    `${url} expected ${allowed.join(" or ")}, got ${response.status()} with body ${text}`,
  ).toBe(true);
  return { body: body as ApiEnvelope<T>, text };
}

async function postJson<T>(
  requestContext: APIRequestContext,
  url: string,
  data: unknown,
  expectedStatus: number | number[] = 200,
) {
  const response = await requestContext.post(url, {
    headers: { "content-type": "application/json" },
    data,
  });
  const parsed = await expectStatus<T>(response, url, expectedStatus);
  return parsed.body.data ?? (parsed.body as unknown as T);
}

async function patchJson<T>(
  requestContext: APIRequestContext,
  url: string,
  data: unknown,
  expectedStatus: number | number[] = 200,
) {
  const response = await requestContext.patch(url, {
    headers: { "content-type": "application/json" },
    data,
  });
  const parsed = await expectStatus<T>(response, url, expectedStatus);
  return parsed.body.data ?? (parsed.body as unknown as T);
}

async function getJson<T>(
  requestContext: APIRequestContext,
  url: string,
  expectedStatus: number | number[] = 200,
) {
  const response = await requestContext.get(url);
  const parsed = await expectStatus<T>(response, url, expectedStatus);
  return parsed.body.data ?? (parsed.body as unknown as T);
}

export function requireV2Local() {
  requireLocalSupabase();
  test.skip(
    process.env.E2E_DATABASE_MODE !== "local",
    "Requires E2E_DATABASE_MODE=local against an isolated local Supabase.",
  );
}

export const requireV2Database = requireV2Local;

export function roleEmail(role: V2Role) {
  return parseRoleEmails()[role] ?? roleSeeds[role].email;
}

export function roleId(role: V2Role) {
  return roleSeeds[role].id;
}

export async function loginV2Role(
  page: Page,
  role: V2Role,
  options: { usePrefix?: boolean } = {},
) {
  const email = options.usePrefix
    ? roleEmail(role).split("@")[0] ?? roleEmail(role)
    : roleEmail(role);
  await login(page, email);
}

export async function openRolePage(
  browser: Browser,
  role: V2Role,
  options: { usePrefix?: boolean } = {},
) {
  const page = await browser.newPage();
  await loginV2Role(page, role, options);
  return page;
}

export async function resetV2Run(
  page: Page,
  payload: {
    runId?: string;
    operation?: "register" | "cleanup";
    brandIds?: string[];
    userIds?: string[];
  } = {},
) {
  const runId = payload.runId ?? randomUUID();
  const response = await page.request.post("/api/e2e/reset", {
    headers: { "x-e2e-reset-token": localResetToken },
    data: {
      runId,
      operation: payload.operation ?? "cleanup",
      brandIds: payload.brandIds ?? [],
      userIds: payload.userIds ?? [],
    },
  });
  const parsed = await expectStatus<{
    ok: boolean;
    runId: string;
    cleaned: { brandIds: string[]; userIds: string[]; brands: number; users: number };
  }>(response, "/api/e2e/reset", 200);
  return parsed.body.data ?? (parsed.body as unknown as {
    ok: boolean;
    runId: string;
    cleaned: { brandIds: string[]; userIds: string[]; brands: number; users: number };
  });
}

export function buildAnnualLine(
  productId: string,
  overrides: Partial<AnnualLineInput> = {},
): AnnualLineInput {
  return {
    productId,
    exPrice: "1.75",
    paidQty: 120,
    expectedFoc: 20,
    openingStock: 12,
    ...overrides,
  };
}

export function buildWave(
  productId: string,
  overrides: Partial<PurchaseWaveInput> = {},
): PurchaseWaveInput {
  return {
    id: randomUUID(),
    sequence: 1,
    orderMonth: `${CURRENT_PLANNING_YEAR}-03`,
    arrivalMonth: `${CURRENT_PLANNING_YEAR}-03`,
    allocations: [
      {
        productId,
        paidQty: 120,
        focQty: 20,
        exPrice: "1.75",
      },
    ],
    ...overrides,
  };
}

export async function updateOrganizationAssignment(
  adminPage: Page,
  input: {
    userId: string;
    tier: "employee_viewer" | "leader" | "manager" | "executive";
    isActive: boolean;
    supervisorId: string | null;
    capabilities: string[];
    brandIds: string[];
    replacementUserId?: string;
  },
) {
  return postJson<OrganizationUserSnapshot>(
    adminPage.request,
    "/api/v2/admin/users/organization",
    {
      ...input,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

async function provisionSeedRoles(adminPage: Page, brandId: string) {
  // Restore the hierarchy from the top down so a previous scenario that
  // deactivated or reassigned a supervisor cannot block its next scenario.
  for (const role of ["executive", "manager", "leader", "viewer"] as const) {
    const seed = roleSeeds[role];
    await updateOrganizationAssignment(adminPage, {
      userId: seed.id,
      tier: seed.tier,
      isActive: true,
      supervisorId: seed.supervisorId,
      capabilities: seed.capabilities,
      brandIds: [brandId],
    });
  }
}

export async function createBrand(
  adminPage: Page,
  code: string,
  name: string,
) {
  return postJson<ScenarioBrand>(
    adminPage.request,
    "/api/v2/master-data/brands",
    {
      code,
      name,
      idempotencyKey: randomUUID(),
    },
    201,
  );
}

export async function createProduct(
  page: Page,
  brandId: string,
  sku: string,
  name: string,
  aliases: string[] = [],
) {
  return postJson<ScenarioProduct>(
    page.request,
    "/api/v2/master-data/products",
    {
      brandId,
      sku,
      name,
      aliases,
      idempotencyKey: randomUUID(),
    },
    201,
  );
}

export async function createAnnualPlanDraft(
  page: Page,
  brandId: string,
  planningYear = CURRENT_PLANNING_YEAR,
) {
  return postJson<AnnualPlanDraft>(
    page.request,
    "/api/v2/annual-plans",
    {
      brandId,
      planningYear,
      idempotencyKey: randomUUID(),
    },
    201,
  );
}

export async function saveAnnualPlanScope(
  page: Page,
  revisionId: string,
  lockVersion: number,
) {
  return postJson<{ revisionId: string; lockVersion: number }>(
    page.request,
    `/api/v2/annual-plans/${revisionId}/scope`,
    {
      expectedLockVersion: lockVersion,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function saveAnnualPlanLines(
  page: Page,
  revisionId: string,
  lockVersion: number,
  lines: AnnualLineInput[],
) {
  return postJson<{
    revisionId: string;
    lockVersion: number;
    lines: AnnualLineInput[];
  }>(
    page.request,
    `/api/v2/annual-plans/${revisionId}/lines`,
    {
      lockVersion,
      lines,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function saveAnnualPlanWaves(
  page: Page,
  revisionId: string,
  lockVersion: number,
  waves: PurchaseWaveInput[],
) {
  return postJson<{
    revisionId: string;
    lockVersion: number;
    paidQty: number;
    focQty: number;
    waves: Array<{
      id: string;
      sequence: number;
      neededMonth: string;
      allocations: Array<{
        productId: string;
        paidQty: number;
        focQty: number;
        exPrice: string;
      }>;
    }>;
  }>(
    page.request,
    `/api/v2/annual-plans/${revisionId}/waves`,
    {
      lockVersion,
      waves,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function submitAnnualPlan(
  page: Page,
  revisionId: string,
  lockVersion: number,
) {
  return postJson<SubmittedAnnualPlan>(
    page.request,
    `/api/v2/annual-plans/${revisionId}/submit`,
    {
      lockVersion,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function decideAnnualPlan(
  page: Page,
  revisionId: string,
  decision: "approve" | "request_changes" | "reject",
  comment = "",
) {
  return postJson<{
    revisionId: string;
    status: string;
    revisionNumber?: number;
    previousRevisionId?: string;
    lockVersion?: number;
  }>(
    page.request,
    `/api/v2/annual-plans/${revisionId}/decision`,
    {
      decision,
      comment,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function createProposalDraft(
  page: Page,
  input: {
    brandId: string;
    planningYear?: number;
    neededMonth?: string;
    reason: string;
  },
) {
  return postJson<ProposalDraft>(
    page.request,
    "/api/v2/proposals",
    {
      brandId: input.brandId,
      planningYear: input.planningYear ?? CURRENT_PLANNING_YEAR,
      neededMonth: input.neededMonth ?? `${CURRENT_PLANNING_YEAR}-04`,
      reason: input.reason,
      idempotencyKey: randomUUID(),
    },
    201,
  );
}

export async function saveProposalDraft(
  page: Page,
  proposalId: string,
  lockVersion: number,
  lines: ProposalLineInput[],
) {
  return patchJson<{
    proposalId: string;
    revisionId: string;
    lockVersion: number;
  }>(
    page.request,
    `/api/v2/proposals/${proposalId}`,
    {
      lockVersion,
      lines,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function submitProposal(
  page: Page,
  proposalId: string,
  lockVersion: number,
) {
  return postJson<ProposalSubmission>(
    page.request,
    `/api/v2/proposals/${proposalId}/submit`,
    {
      lockVersion,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function assignProposalWave(
  page: Page,
  proposalId: string,
  lockVersion: number,
  waveId: string,
) {
  return postJson<ProposalAssignment>(
    page.request,
    `/api/v2/proposals/${proposalId}/assign-wave`,
    {
      lockVersion,
      waveId,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function decideProposal(
  page: Page,
  proposalId: string,
  decision: "approve" | "reject" | "request_changes",
  comment = "",
) {
  return postJson<{ proposalId: string; status: string }>(
    page.request,
    `/api/v2/proposals/${proposalId}/decision`,
    {
      decision,
      comment,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function requestProposalCancellation(
  page: Page,
  proposalId: string,
  reason: string,
) {
  return postJson<{ proposalId: string; status: string }>(
    page.request,
    `/api/v2/proposals/${proposalId}/cancellation`,
    {
      reason,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function decideProposalCancellation(
  page: Page,
  proposalId: string,
  decision: "approve" | "reject",
  comment = "",
) {
  return postJson<{ proposalId: string; status: string; capacityReleased?: boolean }>(
    page.request,
    `/api/v2/proposals/${proposalId}/cancellation-decision`,
    {
      decision,
      comment,
      idempotencyKey: randomUUID(),
    },
    200,
  );
}

export async function createProposalPolicy(
  adminPage: Page,
  input: {
    brandIds: string[];
    mode: "fixed_two_level" | "threshold";
    thresholdAmount: string | null;
    name?: string;
  },
) {
  return postJson<Record<string, unknown>>(
    adminPage.request,
    "/api/v2/admin/proposal-policies",
    {
      name:
        input.name ??
        `E2E ${input.mode} ${input.brandIds[0]?.slice(0, 8) ?? randomSuffix()}`,
      mode: input.mode,
      thresholdAmount: input.thresholdAmount,
      currencyCode: "EUR",
      brandIds: input.brandIds,
      effectiveFrom: CURRENT_EFFECTIVE_DATE,
      effectiveTo: null,
      idempotencyKey: randomUUID(),
    },
    201,
  );
}

export async function createManagedAccount(
  adminPage: Page,
  input: {
    emailPrefix: string;
    displayName: string;
    tier: "employee_viewer" | "leader" | "manager" | "executive";
    supervisorId: string | null;
    capabilities: string[];
    brandIds: string[];
    password?: string;
  },
) {
  const password = input.password ?? "LocalDemo!2026";
  const response = await adminPage.request.post("/api/v2/admin/users", {
    headers: { "content-type": "application/json" },
    data: {
      emailPrefix: input.emailPrefix,
      displayName: input.displayName,
      password,
      tier: input.tier,
      supervisorId: input.supervisorId,
      capabilities: input.capabilities,
      brandIds: input.brandIds,
      idempotencyKey: randomUUID(),
    },
  });
  const parsed = await expectStatus<OrganizationUserSnapshot>(
    response,
    "/api/v2/admin/users",
    201,
  );
  return {
    password,
    responseText: parsed.text,
    user: parsed.body.data ?? (parsed.body as unknown as OrganizationUserSnapshot),
  };
}

export async function listManageableUsers(adminPage: Page) {
  return getJson<OrganizationUserSnapshot[]>(
    adminPage.request,
    "/api/v2/admin/users",
    200,
  );
}

export async function openNotifications(page: Page) {
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Thông báo" })).toBeVisible();
}

export async function expectNotificationText(page: Page, text: string) {
  await openNotifications(page);
  await expect(page.getByText(text)).toBeVisible();
}

export interface V2ScenarioContext {
  runId: string;
  slug: string;
  brand: ScenarioBrand;
  products: ScenarioProduct[];
  createdUserIds: string[];
  session(role: V2Role): Promise<Page>;
  cleanup(): Promise<void>;
}

export async function createV2Scenario(
  browser: Browser,
  name: string,
  options: { productCount?: number } = {},
): Promise<V2ScenarioContext> {
  const runId = randomUUID();
  const slug = slugify(name);
  const sessionCache = new Map<V2Role, Page>();
  const createdUserIds: string[] = [];
  const adminPage = await openRolePage(browser, "administrator");
  sessionCache.set("administrator", adminPage);
  await resetV2Run(adminPage, { runId, operation: "register" });

  const code = `E2E${slug.replace(/-/g, "").slice(0, 12).toUpperCase()}${randomSuffix().slice(0, 4)}`;
  const brand = await createBrand(
    adminPage,
    code.slice(0, 32),
    `E2E ${name} ${runId.slice(0, 8)}`,
  );
  await resetV2Run(adminPage, {
    runId,
    operation: "register",
    brandIds: [brand.id],
  });

  await provisionSeedRoles(adminPage, brand.id);

  const productCount = Math.max(1, options.productCount ?? 2);
  const products: ScenarioProduct[] = [];
  for (let index = 0; index < productCount; index += 1) {
    const ordinal = String(index + 1).padStart(2, "0");
    products.push(
      await createProduct(
        adminPage,
        brand.id,
        `${code}-${ordinal}`,
        `E2E SKU ${ordinal} ${slug}`,
        [`${code}-${ordinal}-ALT`],
      ),
    );
  }

  async function session(role: V2Role) {
    const existing = sessionCache.get(role);
    if (existing) return existing;
    const page = await openRolePage(browser, role);
    sessionCache.set(role, page);
    return page;
  }

  async function cleanup() {
    try {
      const cleanupAdmin = sessionCache.get("administrator") ?? (await openRolePage(browser, "administrator"));
      await resetV2Run(cleanupAdmin, {
        runId,
        operation: "cleanup",
        brandIds: [brand.id],
        userIds: createdUserIds,
      });
    } finally {
      await Promise.all(
        [...sessionCache.values()].map(async (page) => {
          try {
            await page.close();
          } catch {
            // Ignore closed-page cleanup noise.
          }
        }),
      );
    }
  }

  return {
    runId,
    slug,
    brand,
    products,
    createdUserIds,
    session,
    cleanup,
  };
}

export async function registerV2RunUsers(
  adminPage: Page,
  runId: string,
  userIds: string[],
) {
  if (userIds.length === 0) return;
  await resetV2Run(adminPage, {
    runId,
    operation: "register",
    userIds,
  });
}

export async function createApprovedAnnualPlan(
  scenario: V2ScenarioContext,
  ownerRole: "manager" | "executive",
  input: {
    lines?: AnnualLineInput[];
    waves?: PurchaseWaveInput[];
    planningYear?: number;
  } = {},
) {
  const ownerPage = await scenario.session(ownerRole);
  const draft = await createAnnualPlanDraft(
    ownerPage,
    scenario.brand.id,
    input.planningYear ?? CURRENT_PLANNING_YEAR,
  );
  const scope = await saveAnnualPlanScope(
    ownerPage,
    draft.revisionId,
    draft.lockVersion,
  );
  const lines = input.lines ?? [buildAnnualLine(scenario.products[0]!.id)];
  const savedLines = await saveAnnualPlanLines(
    ownerPage,
    draft.revisionId,
    scope.lockVersion,
    lines,
  );
  const waves =
    input.waves ?? [
      buildWave(lines[0]!.productId, {
        allocations: lines.map((line) => ({
          productId: line.productId,
          paidQty: line.paidQty,
          focQty: line.expectedFoc,
          exPrice: line.exPrice,
        })),
      }),
    ];
  const savedWaves = await saveAnnualPlanWaves(
    ownerPage,
    draft.revisionId,
    savedLines.lockVersion,
    waves,
  );
  const submitted = await submitAnnualPlan(
    ownerPage,
    draft.revisionId,
    savedWaves.lockVersion,
  );
  if (ownerRole === "manager") {
    const executivePage = await scenario.session("executive");
    await decideAnnualPlan(executivePage, draft.revisionId, "approve");
  }
  return {
    draft,
    scope,
    savedLines,
    savedWaves,
    submitted,
    waveId:
      savedWaves.waves[0]?.id ??
      waves[0]?.id ??
      "",
  };
}
