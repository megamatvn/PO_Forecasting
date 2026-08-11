import { NextResponse } from "next/server";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";
import { loadPlanningWorkspace } from "@/features/planning/server/load-planning-workspace";
import { exportPlanWorkbook } from "@/features/reports/server/export-plan";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const versionId = new URL(request.url).searchParams.get("versionId") ?? "";
  if (!UUID_PATTERN.test(versionId)) {
    return NextResponse.json({ code: "invalid_version" }, { status: 400 });
  }

  const access = await getCurrentAccess();
  if (!access) {
    return NextResponse.json({ code: "unauthenticated" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: version, error } = await supabase
    .from("plan_versions")
    .select("planning_cycle_id")
    .eq("id", versionId)
    .maybeSingle();
  if (error || !version) {
    return NextResponse.json({ code: "version_not_found" }, { status: 404 });
  }

  const plan = await loadPlanningWorkspace(
    version.planning_cycle_id,
    access,
    versionId,
  );
  if (!plan) {
    return NextResponse.json({ code: "version_not_found" }, { status: 404 });
  }

  const workbook = await exportPlanWorkbook(plan);
  const safeCycleCode = plan.cycle.code.replace(/[^a-z0-9_-]+/gi, "-");
  return new Response(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        `attachment; filename="po-forecast-${safeCycleCode}-v${plan.version.versionNumber}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
