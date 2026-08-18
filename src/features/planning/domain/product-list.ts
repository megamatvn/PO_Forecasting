import type {
  PlanningRowView,
  PlanningSeverity,
} from "@/features/planning/planning-types";

export type PlanningProductSeverity = PlanningSeverity | "all" | "unresolved";
export type PlanningProductSort =
  | "shortage_desc"
  | "sku_asc"
  | "product_name_asc";

export interface PlanningProductListOptions {
  query: string;
  severity: PlanningProductSeverity;
  sort: PlanningProductSort;
}

const collator = new Intl.Collator("vi", {
  sensitivity: "base",
  numeric: true,
});

export function normalizePlanningSearchTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi");
}

function matchesQuery(row: PlanningRowView, query: string) {
  if (!query) return true;

  const compactQuery = query.replaceAll(" ", "");
  return [row.sku, row.productName].some((value) => {
    const normalizedValue = normalizePlanningSearchTerm(value);
    return (
      normalizedValue.includes(query) ||
      normalizedValue.replaceAll(" ", "").includes(compactQuery)
    );
  });
}

function matchesSeverity(
  row: PlanningRowView,
  severity: PlanningProductSeverity,
) {
  if (severity === "all") return true;
  if (severity === "unresolved") return row.recommendedQty > 0;
  return row.severity === severity;
}

function compareRows(
  left: PlanningRowView,
  right: PlanningRowView,
  sort: PlanningProductSort,
) {
  switch (sort) {
    case "shortage_desc":
      return right.recommendedQty - left.recommendedQty;
    case "sku_asc":
      return collator.compare(left.sku, right.sku);
    case "product_name_asc":
      return collator.compare(left.productName, right.productName);
  }
}

/**
 * Returns a new, stable array. The original planning rows remain untouched so
 * this selector can be safely used next to autosave state.
 */
export function selectPlanningRows(
  rows: readonly PlanningRowView[],
  options: PlanningProductListOptions,
) {
  const query = normalizePlanningSearchTerm(options.query);

  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => matchesQuery(row, query) && matchesSeverity(row, options.severity))
    .sort((left, right) => {
      const comparison = compareRows(left.row, right.row, options.sort);
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ row }) => row);
}
