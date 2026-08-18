import "server-only";

import { canPerform } from "@/features/auth/permissions";
import type { CurrentAccess } from "@/features/auth/access-types";
import type {
  PlanningRowView,
  PlanningSeverity,
  PlanningWorkspaceView,
} from "@/features/planning/planning-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CycleRow {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  planning_year: number;
  currency_code: string;
  target_purchase_amount: string;
}

interface PlanningSettingsRow {
  safety_stock: number;
  target_cover_months: number;
}

interface VersionRow {
  id: string;
  version_number: number;
  status: PlanningWorkspaceView["version"]["status"];
  lock_version: number;
  updated_at: string;
}

interface PlanLineRow {
  id: string;
  product_id: string;
  opening_stock: number;
  target_stock: number;
  products: { canonical_sku: string; name: string } | null;
}

interface DemandRow {
  plan_line_id: string;
  demand_qty: number;
}

interface PurchaseBatchRow {
  id: string;
  status: string;
  batch_number: number;
}

interface PurchaseLineRow {
  id: string;
  purchase_batch_id: string;
  product_id: string;
  qty: number;
  foc_qty: number;
  ex_price: string;
  amount: string;
}

interface ProductPriceRow {
  product_id: string;
  ex_price: string;
  effective_from: string;
  effective_to: string | null;
}

interface ProjectionRow {
  product_id: string;
  projection_month: string;
  closing_stock: number;
  shortage_qty: number;
  stock_status: PlanningSeverity;
}

function strongestSeverity(rows: readonly ProjectionRow[]): PlanningSeverity {
  if (rows.some((row) => row.stock_status === "critical")) return "critical";
  if (rows.some((row) => row.stock_status === "warning")) return "warning";
  return "healthy";
}

export async function loadPlanningWorkspace(
  cycleIdOrCode: string,
  access: CurrentAccess,
  versionId?: string,
  brandId?: string,
): Promise<PlanningWorkspaceView | null> {
  const supabase = await createServerSupabaseClient();
  let cycleQuery = supabase
    .from("planning_cycles")
    .select(
      "id, brand_id, code, name, planning_year, currency_code, target_purchase_amount",
    )
    .eq("is_active", true);

  cycleQuery = UUID_PATTERN.test(cycleIdOrCode)
    ? cycleQuery.eq("id", cycleIdOrCode)
    : cycleQuery.eq("code", cycleIdOrCode.toUpperCase());

  if (brandId) {
    cycleQuery = cycleQuery.eq("brand_id", brandId);
  }

  const { data: cycleData, error: cycleError } = await cycleQuery.maybeSingle();
  if (cycleError || !cycleData) return null;
  const cycle = cycleData as CycleRow;
  const brand = access.brands.find((item) => item.id === cycle.brand_id);
  if (!brand) return null;

  const { data: versionData, error: versionError } = await supabase
    .from("plan_versions")
    .select("id, version_number, status, lock_version, updated_at")
    .eq("planning_cycle_id", cycle.id)
    .order("version_number", { ascending: false });

  if (versionError || !versionData?.length) return null;
  const versions = versionData as VersionRow[];
  const version = versionId
    ? versions.find((item) => item.id === versionId)
    : versions.find((item) => item.status === "draft") ?? versions[0];
  if (!version) return null;

  const { data: lineData, error: lineError } = await supabase
    .from("plan_lines")
    .select(
      "id, product_id, opening_stock, target_stock, products(canonical_sku, name)",
    )
    .eq("plan_version_id", version.id)
    .order("created_at");

  if (lineError || !lineData) return null;
  const planLines = lineData as unknown as PlanLineRow[];
  const lineIds = planLines.map((line) => line.id);
  const productIds = planLines.map((line) => line.product_id);
  const today = new Date().toISOString().slice(0, 10);

  const [demandResult, batchResult, projectionResult, priceResult] = await Promise.all([
    lineIds.length
      ? supabase
          .from("plan_monthly_demand")
          .select("plan_line_id, demand_qty")
          .in("plan_line_id", lineIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("purchase_batches")
      .select("id, status, batch_number")
      .eq("plan_version_id", version.id)
      .neq("status", "cancelled")
      .order("batch_number"),
    productIds.length
      ? supabase
          .from("plan_projection_view")
          .select(
            "product_id, projection_month, closing_stock, shortage_qty, stock_status",
          )
          .eq("plan_version_id", version.id)
          .in("product_id", productIds)
          .order("projection_month")
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase
          .from("product_prices")
          .select("product_id, ex_price, effective_from, effective_to")
          .in("product_id", productIds)
          .lte("effective_from", today)
          .or(`effective_to.is.null,effective_to.gte.${today}`)
          .order("effective_from", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const { data: settingsData, error: settingsError } = await supabase
    .from("planning_settings")
    .select("safety_stock, target_cover_months")
    .eq("brand_id", cycle.brand_id)
    .maybeSingle();

  if (
    demandResult.error ||
    batchResult.error ||
    projectionResult.error ||
    priceResult.error ||
    settingsError
  ) {
    return null;
  }

  const batches = (batchResult.data ?? []) as PurchaseBatchRow[];
  const batchIds = batches.map((batch) => batch.id);
  const purchaseResult = batchIds.length
    ? await supabase
        .from("purchase_lines")
        .select("id, purchase_batch_id, product_id, qty, foc_qty, ex_price, amount")
        .in("purchase_batch_id", batchIds)
    : { data: [], error: null };

  if (purchaseResult.error) return null;

  const demands = (demandResult.data ?? []) as DemandRow[];
  const purchaseLines = (purchaseResult.data ?? []) as PurchaseLineRow[];
  const projections = (projectionResult.data ?? []) as ProjectionRow[];
  const pricesByProduct = new Map<string, string>();
  for (const price of (priceResult.data ?? []) as ProductPriceRow[]) {
    if (!pricesByProduct.has(price.product_id)) {
      pricesByProduct.set(price.product_id, String(price.ex_price));
    }
  }
  const settings = settingsData as PlanningSettingsRow | null;
  const plannedBatchIds = new Set(
    batches.filter((batch) => batch.status === "planned").map((batch) => batch.id),
  );

  const rows: PlanningRowView[] = planLines.map((line) => {
    const productProjections = projections.filter(
      (projection) => projection.product_id === line.product_id,
    );
    const finalProjection = productProjections.at(-1);
    const editablePurchase = purchaseLines.find(
      (purchase) =>
        purchase.product_id === line.product_id &&
        plannedBatchIds.has(purchase.purchase_batch_id),
    );
    const allPurchases = purchaseLines.filter(
      (purchase) => purchase.product_id === line.product_id,
    );
    const qty = editablePurchase?.qty ?? 0;
    const focQty = editablePurchase?.foc_qty ?? 0;
    const exPrice = editablePurchase
      ? String(editablePurchase.ex_price)
      : pricesByProduct.get(line.product_id) ?? "0";
    const projectedStock = finalProjection?.closing_stock ?? line.opening_stock;
    const recommendedQty = Math.max(
      0,
      ...productProjections.map((projection) => projection.shortage_qty),
    );

    return {
      planLineId: line.id,
      purchaseLineId: editablePurchase?.id ?? null,
      productId: line.product_id,
      sku: line.products?.canonical_sku ?? line.product_id,
      productName: line.products?.name ?? "Sản phẩm chưa đặt tên",
      openingStock: line.opening_stock,
      targetStock: line.target_stock > 0
        ? line.target_stock
        : (settings?.safety_stock ?? 0)
          + Math.ceil(
            (settings?.target_cover_months ?? 0)
              * demands
                .filter((demand) => demand.plan_line_id === line.id)
                .reduce((total, demand) => total + demand.demand_qty, 0)
              / Math.max(
                1,
                demands.filter((demand) => demand.plan_line_id === line.id).length,
              ),
          ),
      annualDemand: demands
        .filter((demand) => demand.plan_line_id === line.id)
        .reduce((total, demand) => total + demand.demand_qty, 0),
      qty,
      focQty,
      exPrice,
      amount:
        editablePurchase?.amount ??
        allPurchases
          .reduce((total, purchase) => total + Number(purchase.amount), 0)
          .toFixed(2),
      projectedStock,
      recommendedQty,
      severity: strongestSeverity(productProjections),
    };
  });

  return {
    brand: {
      code: brand.code,
    },
    cycle: {
      id: cycle.id,
      code: cycle.code,
      name: cycle.name,
      planningYear: cycle.planning_year,
      currencyCode: cycle.currency_code,
      targetPurchaseAmount: cycle.target_purchase_amount,
    },
    version: {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status,
      lockVersion: version.lock_version,
      updatedAt: version.updated_at,
    },
    canEdit:
      version.status === "draft" &&
      canPerform(new Set(access.roles), "edit_plan"),
    rows,
  };
}
