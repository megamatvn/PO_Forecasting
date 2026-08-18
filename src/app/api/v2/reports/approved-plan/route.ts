import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildApprovedPlanFilename, exportApprovedPlanWorkbook } from "@/features/dashboard/server/export-approved-plan";

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const brandId = search.get("brandId") ?? "";
  const planningYear = Number(search.get("planningYear"));
  if (!validUuid(brandId) || !Number.isInteger(planningYear)) return Response.json({ code: "invalid_scope" }, { status: 400 });
  const access = await getOrganizationContext();
  if (!access) return Response.json({ code: "unauthenticated" }, { status: 401 });
  const brand = access.brands.find((item) => item.id === brandId);
  const canView = access.isAdministrator || access.capabilities.includes("view_approved_plan") || Boolean(brand?.capabilities.includes("view_approved_plan"));
  if (!canView) return Response.json({ code: "forbidden" }, { status: 403 });
  const supabase = await createServerSupabaseClient();
  const { data: lineRows, error: lineError } = await supabase.from("v2_dashboard_approved_plan_lines").select("*").eq("brand_id", brandId).eq("planning_year", planningYear);
  if (lineError || !lineRows?.length) return Response.json({ code: "approved_plan_not_found" }, { status: 404 });
  const revisionIds = [...new Set(lineRows.map((row) => String((row as Record<string, unknown>).revision_id)))];
  const [{ data: waveRows }, { data: waveMeta }] = await Promise.all([
    supabase.from("purchase_wave_revisions").select("revision_id,wave_id,order_month,arrival_month,purchase_waves(wave_number,official_po_number,status),purchase_wave_allocations(paid_qty,foc_qty,ex_price,products(canonical_sku))").in("revision_id", revisionIds),
    supabase.from("v2_dashboard_purchase_waves").select("*").eq("brand_id", brandId).eq("planning_year", planningYear),
  ]);
  const first = lineRows[0] as Record<string, unknown>;
  const lines = lineRows.map((row) => {
    const item = row as Record<string, unknown>;
    return { sku: String(item.sku ?? ""), productName: String(item.product_name ?? ""), openingStock: Number(item.opening_stock ?? 0), annualPaidQty: Number(item.annual_paid_qty ?? 0), annualFocQty: Number(item.annual_foc_qty ?? 0), exPrice: String(item.ex_price ?? "0"), providedAmount: item.baseline_amount as string | null };
  });
  const wavesById = new Map((waveMeta ?? []).map((row) => [String((row as Record<string, unknown>).wave_id), row as Record<string, unknown>]));
  const waves = (waveRows ?? []).filter((row) => revisionIds.includes(String((row as Record<string, unknown>).revision_id))).map((row) => {
    const item = row as Record<string, unknown>;
    const wave = Array.isArray(item.purchase_waves) ? item.purchase_waves[0] as Record<string, unknown> | undefined : item.purchase_waves as Record<string, unknown> | undefined;
    const meta = wavesById.get(String(item.wave_id));
    const allocations = Array.isArray(item.purchase_wave_allocations) ? item.purchase_wave_allocations as Array<Record<string, unknown>> : [];
    return { waveNumber: Number(wave?.wave_number ?? meta?.wave_number ?? 0), officialPoNumber: String(wave?.official_po_number ?? meta?.official_po_number ?? "") || null, status: String(wave?.status ?? meta?.status ?? "planned"), orderMonth: String(item.order_month ?? meta?.order_month ?? "").slice(0, 7), arrivalMonth: String(item.arrival_month ?? meta?.arrival_month ?? "").slice(0, 7), lines: allocations.map((allocation) => { const product = Array.isArray(allocation.products) ? allocation.products[0] as Record<string, unknown> | undefined : allocation.products as Record<string, unknown> | undefined; return { sku: String(product?.canonical_sku ?? ""), paidQty: Number(allocation.paid_qty ?? 0), focQty: Number(allocation.foc_qty ?? 0), exPrice: String(allocation.ex_price ?? "0"), providedAmount: allocation.amount as string | null }; }) };
  });
  const workbook = await exportApprovedPlanWorkbook({ brandCode: brand?.code ?? String(first.brand_code ?? ""), brandName: brand?.name ?? String(first.brand_name ?? ""), planningYear, currencyCode: String(first.currency_code ?? "EUR"), revisionNumber: Number(first.revision_number ?? 0), lines, waves });
  return new Response(new Uint8Array(workbook), { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${buildApprovedPlanFilename(brand?.code ?? String(first.brand_code ?? ""), planningYear)}"`, "cache-control": "private, no-store" } });
}
