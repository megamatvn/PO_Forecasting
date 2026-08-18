import { describe, expect, it } from "vitest";
import {
  normalizePlanningSearchTerm,
  selectPlanningRows,
} from "@/features/planning/domain/product-list";
import type { PlanningRowView } from "@/features/planning/planning-types";

const rows: PlanningRowView[] = [
  {
    planLineId: "line-green",
    productId: "product-green",
    sku: "ET-015025",
    productName: "Đặc trị xanh",
    openingStock: 319_321,
    targetStock: 0,
    annualDemand: 1_000_787,
    qty: 0,
    focQty: 0,
    exPrice: "4.20",
    amount: "0.00",
    projectedStock: -681_466,
    recommendedQty: 681_466,
    severity: "critical",
  },
  {
    planLineId: "line-spray",
    productId: "product-spray",
    sku: "ET-015073",
    productName: "Xịt 100ml xanh dương",
    openingStock: 1_790,
    targetStock: 0,
    annualDemand: 12_301,
    qty: 0,
    focQty: 0,
    exPrice: "1.70",
    amount: "0.00",
    projectedStock: -10_511,
    recommendedQty: 10_511,
    severity: "warning",
  },
  {
    planLineId: "line-healthy",
    productId: "product-healthy",
    sku: "ET-2",
    productName: "Bộ chăm sóc",
    openingStock: 10,
    targetStock: 0,
    annualDemand: 0,
    qty: 0,
    focQty: 0,
    exPrice: "1.00",
    amount: "0.00",
    projectedStock: 10,
    recommendedQty: 0,
    severity: "healthy",
  },
  {
    planLineId: "line-10",
    productId: "product-10",
    sku: "ET-10",
    productName: "Áo dưỡng",
    openingStock: 0,
    targetStock: 0,
    annualDemand: 1,
    qty: 0,
    focQty: 0,
    exPrice: "1.00",
    amount: "0.00",
    projectedStock: -1,
    recommendedQty: 0,
    severity: "critical",
  },
  {
    planLineId: "line-tie-one",
    productId: "product-tie-one",
    sku: "ET-100",
    productName: "Áo đặc trị",
    openingStock: 0,
    targetStock: 0,
    annualDemand: 10,
    qty: 0,
    focQty: 0,
    exPrice: "1.00",
    amount: "0.00",
    projectedStock: -10,
    recommendedQty: 10,
    severity: "warning",
  },
  {
    planLineId: "line-tie-two",
    productId: "product-tie-two",
    sku: "ET-101",
    productName: "Áo đặc trị",
    openingStock: 0,
    targetStock: 0,
    annualDemand: 10,
    qty: 0,
    focQty: 0,
    exPrice: "1.00",
    amount: "0.00",
    projectedStock: -10,
    recommendedQty: 10,
    severity: "warning",
  },
];

describe("planning product list selectors", () => {
  it("normalizes Vietnamese accents and SKU punctuation when searching", () => {
    expect(normalizePlanningSearchTerm("  Đặc-trị XANH ")).toBe("dac tri xanh");

    expect(
      selectPlanningRows(rows, {
        query: "dac tri xanh",
        severity: "critical",
        sort: "shortage_desc",
      }).map((row) => row.planLineId),
    ).toEqual(["line-green"]);

    expect(
      selectPlanningRows(rows, {
        query: "et015025",
        severity: "all",
        sort: "shortage_desc",
      }).map((row) => row.planLineId),
    ).toEqual(["line-green"]);
  });

  it("filters Critical, Warning, Healthy and unresolved rows without mutating input", () => {
    const inputOrder = rows.map((row) => row.planLineId);

    expect(
      selectPlanningRows(rows, { query: "", severity: "critical", sort: "sku_asc" }).map(
        (row) => row.planLineId,
      ),
    ).toEqual(["line-10", "line-green"]);
    expect(
      selectPlanningRows(rows, { query: "", severity: "warning", sort: "sku_asc" }).map(
        (row) => row.planLineId,
      ),
    ).toEqual(["line-tie-one", "line-tie-two", "line-spray"]);
    expect(
      selectPlanningRows(rows, { query: "", severity: "healthy", sort: "sku_asc" }).map(
        (row) => row.planLineId,
      ),
    ).toEqual(["line-healthy"]);
    expect(
      selectPlanningRows(rows, { query: "", severity: "unresolved", sort: "sku_asc" }).map(
        (row) => row.planLineId,
      ),
    ).toEqual(["line-tie-one", "line-tie-two", "line-green", "line-spray"]);
    expect(rows.map((row) => row.planLineId)).toEqual(inputOrder);
  });

  it("sorts by shortage, SKU and Vietnamese product name with stable ties", () => {
    expect(
      selectPlanningRows(rows, { query: "", severity: "all", sort: "shortage_desc" }).map(
        (row) => row.planLineId,
      ),
    ).toEqual([
      "line-green",
      "line-spray",
      "line-tie-one",
      "line-tie-two",
      "line-healthy",
      "line-10",
    ]);

    expect(
      selectPlanningRows(rows, { query: "", severity: "all", sort: "sku_asc" }).map(
        (row) => row.planLineId,
      ),
    ).toEqual([
      "line-healthy",
      "line-10",
      "line-tie-one",
      "line-tie-two",
      "line-green",
      "line-spray",
    ]);

    expect(
      selectPlanningRows(rows, { query: "", severity: "all", sort: "product_name_asc" }).map(
        (row) => row.planLineId,
      ),
    ).toEqual([
      "line-10",
      "line-tie-one",
      "line-tie-two",
      "line-healthy",
      "line-green",
      "line-spray",
    ]);
  });
});
