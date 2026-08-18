import postgres from "postgres";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("Thiếu SUPABASE_DB_URL.");
const url = new URL(connectionString);
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Chỉ được verify trên database local/test.");
const legacyTables = [
  "import_issues", "import_staging_rows", "import_batches", "sales_demand", "inventory_snapshots",
  "purchased_receipts", "source_snapshots", "version_diffs", "purchase_lines", "purchase_batches",
  "plan_monthly_demand", "plan_lines", "plan_versions", "planning_cycles", "approval_steps",
  "approval_requests", "approval_policy_brands", "approval_policies", "suppliers", "product_prices",
  "planning_settings", "user_brand_access", "user_roles", "roles",
];
const legacyRoutes = [
  "src/app/(app)/imports/page.tsx",
  "src/app/(app)/planning/page.tsx",
  "src/app/(app)/versions/page.tsx",
  "src/app/api/imports/preview/route.ts",
  "src/app/api/imports/commit/route.ts",
  "src/app/api/planning/[planVersionId]/draft/route.ts",
  "src/app/api/planning/[planVersionId]/revision/route.ts",
  "src/app/api/planning/[planVersionId]/submit/route.ts",
  "src/app/api/approvals/[requestId]/decision/route.ts",
  "src/app/api/admin/users/access/route.ts",
  "src/app/api/admin/approval-policies/route.ts",
];
const sql = postgres(connectionString, { max: 1 });
try {
  const counts = {};
  for (const table of legacyTables) {
    const [row] = await sql.unsafe(`select count(*)::int as count from public."${table}"`).catch(() => [{ count: 0 }]);
    counts[table] = Number(row?.count ?? 0);
  }
  const [adminCount] = await sql`select count(*)::int as count from auth.users where lower(email) = 'admin@sagen-groupe.com'`;
  if (adminCount.count !== 1) throw new Error(`Số lượng admin@sagen-groupe.com không hợp lệ: ${adminCount.count}.`);
  const [admin] = await sql`select id, email_confirmed_at from auth.users where lower(email) = 'admin@sagen-groupe.com' limit 1`;
  if (!admin) throw new Error("Không còn tài khoản admin@sagen-groupe.com.");
  const [profile] = await sql`select is_active, org_tier::text as org_tier from public.profiles where id = ${admin.id}`;
  if (!profile?.is_active || profile.org_tier !== "executive") throw new Error("Tài khoản Admin không còn quyền điều hành hợp lệ.");
  const capabilities = await sql`
    select capability::text as capability
    from public.user_capabilities
    where user_id = ${admin.id}
    order by capability::text
  `;
  const expected = ["administer_system", "create_annual_plan", "create_purchase_proposal", "manage_master_data", "view_approved_plan"];
  const actual = capabilities.map((row) => row.capability);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Capability Admin không hợp lệ: ${JSON.stringify(actual)}.`);
  }
  const [brandPermissionCount] = await sql`select count(*)::int as count from public.user_brand_permissions`;
  if (brandPermissionCount.count !== 0) throw new Error("Brand permissions phải rỗng sau cutover.");
  const [proposalPolicyTables] = await sql`
    select
      to_regclass('public.proposal_approval_policies') is not null as policies,
      to_regclass('public.proposal_approval_policy_brands') is not null as brand_scope
  `;
  if (!proposalPolicyTables?.policies || !proposalPolicyTables?.brand_scope) {
    throw new Error("Hợp đồng chính sách duyệt đề xuất V2 chưa tồn tại.");
  }
  const nonZero = Object.entries(counts).filter(([, count]) => count !== 0);
  if (nonZero.length) throw new Error(`Legacy business rows vẫn còn: ${JSON.stringify(nonZero)}`);

  const missingLegacyRoutes = [];
  for (const routePath of legacyRoutes) {
    try {
      await import("node:fs/promises").then(({ access }) => access(routePath));
      missingLegacyRoutes.push(routePath);
    } catch {
      // Expected after contract cutover.
    }
  }
  if (missingLegacyRoutes.length) throw new Error(`Legacy route vẫn còn trong source: ${missingLegacyRoutes.join(", ")}`);

  const appBaseUrl = process.env.APP_BASE_URL;
  if (appBaseUrl) {
    const login = await fetch(new URL("/login", appBaseUrl), { redirect: "manual" });
    if (login.status >= 500 || login.status === 404) throw new Error(`Login page không sẵn sàng: HTTP ${login.status}.`);
    const dashboard = await fetch(new URL("/dashboard", appBaseUrl), { redirect: "manual" });
    if (dashboard.status >= 500 || dashboard.status === 404) throw new Error(`Dashboard route không sẵn sàng: HTTP ${dashboard.status}.`);
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const password = process.env.CUTOVER_ADMIN_PASSWORD;
  if (supabaseUrl && anonKey && password) {
    const authResponse = await fetch(new URL("/auth/v1/token?grant_type=password", supabaseUrl), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "admin@sagen-groupe.com", password }),
    });
    if (!authResponse.ok) throw new Error(`Admin login rehearsal failed: HTTP ${authResponse.status}.`);
  }

  console.log(JSON.stringify({ legacyCounts: counts, retainedAdminUserId: admin.id, adminCapabilities: actual, ok: true }, null, 2));
} finally {
  await sql.end({ timeout: 2 });
}
