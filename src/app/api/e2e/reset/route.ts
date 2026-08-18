import { NextResponse } from "next/server";
import postgres from "postgres";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETAINED_ADMIN_ID = "91000000-0000-0000-0000-000000000001";

const bodySchema = z.object({
  runId: z.string().regex(UUID_PATTERN),
  operation: z.enum(["register", "cleanup"]).default("cleanup"),
  resetToken: z.string().min(1).optional(),
  brandIds: z.array(z.string().uuid()).default([]),
  userIds: z.array(z.string().uuid()).default([]),
});

function unavailable() {
  return NextResponse.json({ code: "not_found" }, { status: 404 });
}

function isLocalHost(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function parseUrl(value: string | undefined | null) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function missingIds(registered: string[], requested: string[]) {
  const allowed = new Set(registered);
  return requested.filter((id) => !allowed.has(id));
}

type LegacyCleanupTransaction = postgres.TransactionSql;

async function deleteLegacyRelationIfPresent(
  tx: LegacyCleanupTransaction,
  relation: "user_brand_access" | "user_roles",
  column: "brand_id" | "user_id",
  ids: string[],
) {
  const relationName = `public.${relation}`;
  const result = (await tx.unsafe(
    "select to_regclass($1) is not null as exists",
    [relationName],
  )) as Array<{ exists?: boolean }>;
  if (!result[0]?.exists) return;

  await tx.unsafe(
    `delete from public."${relation}" where "${column}" = any($1::uuid[])`,
    [ids],
  );
}

export async function POST(request: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.E2E_MODE !== "true" ||
    process.env.E2E_DATABASE_MODE !== "local"
  ) {
    return unavailable();
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }

  const expectedResetToken = process.env.E2E_RESET_TOKEN;
  const suppliedResetToken =
    request.headers.get("x-e2e-reset-token") ?? parsed.data.resetToken;
  if (!expectedResetToken || suppliedResetToken !== expectedResetToken) {
    return unavailable();
  }

  const dbUrl = parseUrl(process.env.SUPABASE_DB_URL);
  const publicUrl = parseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!dbUrl || !isLocalHost(dbUrl.hostname) || !publicUrl || !isLocalHost(publicUrl.hostname)) {
    return unavailable();
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ code: "unauthenticated" }, { status: 401 });
  }

  const { data: isAdministrator, error: adminError } =
    await supabase.rpc("current_user_has_capability", {
      p_capability: "administer_system",
    });
  if (adminError || isAdministrator !== true) {
    return NextResponse.json({ code: "forbidden" }, { status: 403 });
  }

  const brandIds = unique(parsed.data.brandIds);
  const userIds = unique(parsed.data.userIds);
  if (userIds.includes(RETAINED_ADMIN_ID)) {
    return NextResponse.json(
      { code: "retained_admin_forbidden" },
      { status: 409 },
    );
  }
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1 });

  try {
    const result = await sql.begin(async (tx) => {
      type ScenarioRunRow = {
        run_id: string;
        owner_id: string;
        registered_brand_ids: string[];
        registered_user_ids: string[];
        created_at: Date;
      };

      const registryRows = await tx<ScenarioRunRow[]>`
        select run_id, owner_id, registered_brand_ids, registered_user_ids, created_at
        from public.e2e_scenario_runs
        where run_id = ${parsed.data.runId}::uuid
        for update
      `;
      const registry = registryRows[0];

      if (parsed.data.operation === "register") {
        if (!registry) {
          if (brandIds.length > 0 || userIds.length > 0) {
            throw new Error("isolated_scenario_not_registered");
          }
          await tx`
            insert into public.e2e_scenario_runs(run_id, owner_id)
            values (${parsed.data.runId}::uuid, ${user.id}::uuid)
          `;
          return {
            ok: true,
            runId: parsed.data.runId,
            registered: { brandIds: [], userIds: [] },
          };
        }

        if (registry.owner_id !== user.id) {
          throw new Error("isolated_scenario_owner_mismatch");
        }

        if (brandIds.length > 0) {
          const brandActions = await tx<{ resource_id: string }[]>`
            select resource_id
            from public.action_idempotency
            where action_type = 'create_brand_v2'
              and resource_id = any(${brandIds}::uuid[])
              and created_by = ${user.id}::uuid
              and created_at >= ${registry.created_at}
          `;
          if (missingIds(brandActions.map((row) => row.resource_id), brandIds).length > 0) {
            throw new Error("isolated_target_registration_required");
          }
        }

        if (userIds.length > 0) {
          const userActions = await tx<{ resource_id: string }[]>`
            select resource_id
            from public.action_idempotency
            where action_type = 'set_user_organization_v2'
              and resource_id = any(${userIds}::uuid[])
              and created_by = ${user.id}::uuid
              and created_at >= ${registry.created_at}
          `;
          if (missingIds(userActions.map((row) => row.resource_id), userIds).length > 0) {
            throw new Error("isolated_target_registration_required");
          }
        }

        const registeredBrandIds = unique([
          ...(registry.registered_brand_ids ?? []),
          ...brandIds,
        ]);
        const registeredUserIds = unique([
          ...(registry.registered_user_ids ?? []),
          ...userIds,
        ]);
        await tx`
          update public.e2e_scenario_runs
          set registered_brand_ids = ${registeredBrandIds}::uuid[],
              registered_user_ids = ${registeredUserIds}::uuid[]
          where run_id = ${parsed.data.runId}::uuid
        `;
        return {
          ok: true,
          runId: parsed.data.runId,
          registered: { brandIds: registeredBrandIds, userIds: registeredUserIds },
        };
      }

      if (!registry) throw new Error("isolated_scenario_not_registered");
      if (registry.owner_id !== user.id) {
        throw new Error("isolated_scenario_owner_mismatch");
      }

      const targetBrandIds = brandIds.length
        ? brandIds
        : unique(registry.registered_brand_ids ?? []);
      const targetUserIds = userIds.length
        ? userIds
        : unique(registry.registered_user_ids ?? []);
      if (
        missingIds(registry.registered_brand_ids ?? [], targetBrandIds).length > 0 ||
        missingIds(registry.registered_user_ids ?? [], targetUserIds).length > 0
      ) {
        throw new Error("isolated_target_not_registered");
      }

      // The audit table is append-only for every normal application session.
      // This transaction-local marker is accepted only by the local postgres
      // superuser trigger exception introduced for the isolated E2E harness.
      await tx`select set_config('app.e2e_cleanup_audit', 'true', true)`;

      let cleanedBrands = 0;
      let cleanedUsers = 0;

      if (targetBrandIds.length > 0) {
        const policyIds = (
          await tx<{ policy_id: string }[]>`
            select distinct policy_id
            from public.proposal_approval_policy_brands
            where brand_id = any(${targetBrandIds}::uuid[])
          `
        ).map((row) => row.policy_id);

        const cycleIds = (
          await tx<{ id: string }[]>`
            select id
            from public.annual_plan_cycles
            where brand_id = any(${targetBrandIds}::uuid[])
          `
        ).map((row) => row.id);

        const revisionIds = cycleIds.length
          ? (
              await tx<{ id: string }[]>`
                select id
                from public.annual_plan_revisions
                where cycle_id = any(${cycleIds}::uuid[])
              `
            ).map((row) => row.id)
          : [];

        const waveRevisionIds = revisionIds.length
          ? (
              await tx<{ id: string }[]>`
                select id
                from public.purchase_wave_revisions
                where revision_id = any(${revisionIds}::uuid[])
              `
            ).map((row) => row.id)
          : [];

        const waveIds = cycleIds.length
          ? (
              await tx<{ id: string }[]>`
                select id
                from public.purchase_waves
                where cycle_id = any(${cycleIds}::uuid[])
              `
            ).map((row) => row.id)
          : [];

        const proposalIds = (
          await tx<{ id: string }[]>`
            select id
            from public.purchase_proposals
            where brand_id = any(${targetBrandIds}::uuid[])
          `
        ).map((row) => row.id);

        const proposalRevisionIds = proposalIds.length
          ? (
              await tx<{ id: string }[]>`
                select id
                from public.proposal_revisions
                where proposal_id = any(${proposalIds}::uuid[])
              `
            ).map((row) => row.id)
          : [];

        const approvalCaseIds = (
          await tx<{ id: string }[]>`
            select id
            from public.workflow_approval_cases
            where brand_id = any(${targetBrandIds}::uuid[])
          `
        ).map((row) => row.id);

        const productIds = (
          await tx<{ id: string }[]>`
            select id
            from public.products
            where brand_id = any(${targetBrandIds}::uuid[])
          `
        ).map((row) => row.id);

        const sourceIds = unique([
          ...proposalIds,
          ...approvalCaseIds,
          ...revisionIds,
          ...cycleIds,
          ...waveIds,
        ]);

        if (sourceIds.length > 0) {
          await tx`
            delete from public.notifications
            where source_id = any(${sourceIds}::uuid[])
          `;
          await tx`
            delete from public.notification_outbox
            where source_id = any(${sourceIds}::uuid[])
          `;
          await tx`
            delete from public.action_idempotency
            where resource_id = any(${sourceIds}::uuid[])
          `;
        }

        if (approvalCaseIds.length > 0) {
          await tx`
            delete from public.workflow_approval_decisions
            where case_id = any(${approvalCaseIds}::uuid[])
          `;
          await tx`
            delete from public.workflow_approval_steps
            where case_id = any(${approvalCaseIds}::uuid[])
          `;
          await tx`
            delete from public.workflow_approval_cases
            where id = any(${approvalCaseIds}::uuid[])
          `;
        }

        if (proposalRevisionIds.length > 0) {
          await tx`
            delete from public.capacity_reservations
            where proposal_revision_id = any(${proposalRevisionIds}::uuid[])
          `;
          await tx`
            delete from public.proposal_route_snapshots
            where proposal_revision_id = any(${proposalRevisionIds}::uuid[])
          `;
          await tx`
            delete from public.proposal_lines
            where proposal_revision_id = any(${proposalRevisionIds}::uuid[])
          `;
          await tx`
            delete from public.proposal_revisions
            where id = any(${proposalRevisionIds}::uuid[])
          `;
        }

        if (proposalIds.length > 0) {
          await tx`
            delete from public.purchase_proposals
            where id = any(${proposalIds}::uuid[])
          `;
        }

        if (waveRevisionIds.length > 0) {
          await tx`
            delete from public.purchase_wave_allocations
            where wave_revision_id = any(${waveRevisionIds}::uuid[])
          `;
          await tx`
            delete from public.purchase_wave_revisions
            where id = any(${waveRevisionIds}::uuid[])
          `;
        }

        if (revisionIds.length > 0) {
          await tx`
            delete from public.annual_plan_excel_checkpoints
            where revision_id = any(${revisionIds}::uuid[])
          `;
          await tx`
            delete from public.annual_plan_excel_staging
            where revision_id = any(${revisionIds}::uuid[])
          `;
          await tx`
            delete from public.annual_plan_lines
            where revision_id = any(${revisionIds}::uuid[])
          `;
          await tx`
            delete from public.annual_plan_revisions
            where id = any(${revisionIds}::uuid[])
          `;
        }

        if (waveIds.length > 0) {
          await tx`
            delete from public.purchase_waves
            where id = any(${waveIds}::uuid[])
          `;
        }

        if (cycleIds.length > 0) {
          await tx`
            delete from public.annual_plan_cycles
            where id = any(${cycleIds}::uuid[])
          `;
        }

        if (policyIds.length > 0) {
          await tx`
            delete from public.proposal_approval_policy_brands
            where policy_id = any(${policyIds}::uuid[])
          `;
          await tx`
            delete from public.proposal_approval_policies
            where id = any(${policyIds}::uuid[])
          `;
        }

        if (productIds.length > 0) {
          await tx`
            delete from public.sku_aliases
            where product_id = any(${productIds}::uuid[])
          `;
          await tx`
            delete from public.products
            where id = any(${productIds}::uuid[])
          `;
        }

        await tx`
          delete from public.user_brand_permissions
          where brand_id = any(${targetBrandIds}::uuid[])
        `;
        await deleteLegacyRelationIfPresent(tx, "user_brand_access", "brand_id", targetBrandIds);
        await tx`
          delete from public.audit_events
          where brand_id = any(${targetBrandIds}::uuid[])
        `;
        const deletedBrands = await tx<{ id: string }[]>`
          delete from public.brands
          where id = any(${targetBrandIds}::uuid[])
          returning id
        `;
        cleanedBrands = deletedBrands.length;
      }

      if (targetUserIds.length > 0) {
        const remainingUserReferences = await tx<{ reference_count: number }[]>`
          select count(*)::int as reference_count
          from (
            select owner_id as user_id from public.annual_plan_revisions
            union all
            select assigned_executive_id from public.annual_plan_revisions where assigned_executive_id is not null
            union all
            select owner_id from public.purchase_proposals
            union all
            select assigned_manager_id from public.purchase_proposals where assigned_manager_id is not null
            union all
            select assigned_executive_id from public.purchase_proposals where assigned_executive_id is not null
            union all
            select submitted_by from public.workflow_approval_cases
            union all
            select assigned_executive_id from public.workflow_approval_cases where assigned_executive_id is not null
            union all
            select assignee_id from public.workflow_approval_steps
            union all
            select acted_by from public.workflow_approval_steps where acted_by is not null
            union all
            select decided_by from public.workflow_approval_decisions
          ) as user_refs
          where user_refs.user_id = any(${targetUserIds}::uuid[])
        `;
        if ((remainingUserReferences[0]?.reference_count ?? 0) > 0) {
          throw new Error("isolated_user_cleanup_required");
        }

        await tx`
          delete from public.notifications
          where recipient_id = any(${targetUserIds}::uuid[])
        `;
        await tx`
          delete from public.notification_outbox
          where recipient_id = any(${targetUserIds}::uuid[])
        `;
        await tx`
          delete from public.user_brand_permissions
          where user_id = any(${targetUserIds}::uuid[])
             or source_user_id = any(${targetUserIds}::uuid[])
        `;
        await deleteLegacyRelationIfPresent(tx, "user_brand_access", "user_id", targetUserIds);
        await tx`
          delete from public.user_capabilities
          where user_id = any(${targetUserIds}::uuid[])
        `;
        await tx`
          delete from public.reporting_lines
          where user_id = any(${targetUserIds}::uuid[])
             or supervisor_id = any(${targetUserIds}::uuid[])
        `;
        await deleteLegacyRelationIfPresent(tx, "user_roles", "user_id", targetUserIds);
        await tx`
          delete from public.audit_events
          where entity_id = any(${targetUserIds}::uuid[])
        `;
        await tx`
          delete from public.action_idempotency
          where resource_id = any(${targetUserIds}::uuid[])
             or created_by = any(${targetUserIds}::uuid[])
        `;
        await tx`
          delete from public.profiles
          where id = any(${targetUserIds}::uuid[])
        `;
        await tx`
          delete from auth.identities
          where user_id = any(${targetUserIds}::uuid[])
        `;
        const deletedUsers = await tx<{ id: string }[]>`
          delete from auth.users
          where id = any(${targetUserIds}::uuid[])
          returning id
        `;
        cleanedUsers = deletedUsers.length;
      }

      await tx`
        delete from public.e2e_scenario_runs
        where run_id = ${parsed.data.runId}::uuid
      `;

      return {
        ok: true,
        runId: parsed.data.runId,
        cleaned: {
          brandIds: targetBrandIds,
          userIds: targetUserIds,
          brands: cleanedBrands,
          users: cleanedUsers,
        },
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "isolated_user_cleanup_required",
        "isolated_scenario_not_registered",
        "isolated_scenario_owner_mismatch",
        "isolated_target_not_registered",
        "isolated_target_registration_required",
      ].includes(error.message)
    ) {
      return NextResponse.json(
        {
          code:
            error.message === "isolated_user_cleanup_required"
              ? "isolated_user_cleanup_required"
              : error.message,
        },
        { status: 409 },
      );
    }
    throw error;
  } finally {
    await sql.end({ timeout: 2 });
  }
}
