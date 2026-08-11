import { NextResponse } from "next/server";
import postgres from "postgres";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ runId: z.string().regex(UUID_PATTERN) });
const brandId = "10000000-0000-0000-0000-000000000001";
const plannerId = "90000000-0000-0000-0000-000000000002";
const productId = "20000000-0000-0000-0000-000000000150";

function unavailable() {
  return NextResponse.json({ code: "not_found" }, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.E2E_MODE !== "true") {
    return unavailable();
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "unauthenticated" }, { status: 401 });

  const { data: isAdministrator } = await supabase.rpc("current_user_has_role", {
    p_role: "administrator",
  });
  if (!isAdministrator) return NextResponse.json({ code: "forbidden" }, { status: 403 });

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) return unavailable();

  const databaseUrl = new URL(connectionString);
  if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) return unavailable();

  const sql = postgres(connectionString, { max: 1 });
  try {
    const result = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.allow_plan_version_mutation', 'on', true)`;
      await transaction`
        insert into public.brands (id, code, name, is_active)
        values ('10000000-0000-0000-0000-000000000002', 'HID', 'Hidden E2E Brand', true)
        on conflict (id) do update
        set code = excluded.code, name = excluded.name, is_active = excluded.is_active
      `;
      const existingVersions = await transaction<{ id: string }[]>`
        select plan_versions.id
        from public.plan_versions
        join public.planning_cycles
          on planning_cycles.id = plan_versions.planning_cycle_id
        where planning_cycles.brand_id = ${brandId}
          and planning_cycles.planning_year = 2199
      `;
      const existingVersionIds = existingVersions.map((row) => row.id);

      if (existingVersionIds.length > 0) {
        await transaction`
          delete from public.version_diffs
          where from_version_id = any(${existingVersionIds}::uuid[])
             or to_version_id = any(${existingVersionIds}::uuid[])
        `;
        await transaction`
          delete from public.approval_requests
          where plan_version_id = any(${existingVersionIds}::uuid[])
        `;
        await transaction`
          delete from public.plan_versions
          where id = any(${existingVersionIds}::uuid[])
        `;
      }

      await transaction`
        delete from public.approval_policy_brands
        where policy_id in (
          select id from public.approval_policies where name like 'E2E %'
        )
      `;
      await transaction`
        delete from public.approval_policies
        where name like 'E2E %'
      `;

      await transaction`
        delete from public.planning_cycles
        where brand_id = ${brandId}
          and planning_year = 2199
      `;

      const code = `E2E-${parsed.data.runId.replaceAll("-", "").slice(0, 12)}`.toUpperCase();
      await transaction`
        insert into public.planning_cycles (
          id, brand_id, code, name, planning_year, target_purchase_amount, currency_code
        ) values (
          ${parsed.data.runId}, ${brandId}, ${code}, 'E2E Forecast 2199', 2199, 100000, 'EUR'
        )
      `;
      const [version] = await transaction<{ id: string }[]>`
        insert into public.plan_versions (
          planning_cycle_id, version_number, status, created_by
        ) values (${parsed.data.runId}, 1, 'draft', ${plannerId})
        returning id
      `;
      const [line] = await transaction<{ id: string }[]>`
        insert into public.plan_lines (
          plan_version_id, product_id, opening_stock, target_stock, notes
        ) values (
          ${version.id}, ${productId}, 32, 0,
          'E2E active SKU without future PO; expected shortage 2,368.'
        )
        returning id
      `;
      await transaction`
        insert into public.plan_monthly_demand (plan_line_id, demand_month, demand_qty)
        values (${line.id}, '2199-01-01', 2400)
      `;

      return { cycleId: parsed.data.runId, versionId: version.id, code };
    });

    return NextResponse.json(result);
  } finally {
    await sql.end({ timeout: 2 });
  }
}
