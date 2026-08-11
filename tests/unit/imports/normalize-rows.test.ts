import { describe, expect, it } from "vitest";
import { normalizeRows } from "@/features/imports/server/normalize-rows";
import type { RawForecastRow } from "@/features/imports/domain/import-types";

const rawRow: RawForecastRow = {
  rowNumber: 7,
  rawSku: "ET-015027",
  productName: "Đặc trị xanh",
  exPrice: "4.25",
  currentStock: 100,
  purchaseWaves: [],
};

describe("normalizeRows", () => {
  it("maps every source alias to the canonical SKU", () => {
    const aliasMap = new Map([
      ["ET-015025", "ET-015025"],
      ["ET-015026", "ET-015025"],
      ["ET-015027", "ET-015025"],
    ]);

    expect(normalizeRows([rawRow], aliasMap)).toContainEqual(
      expect.objectContaining({
        rawSku: "ET-015027",
        canonicalSku: "ET-015025",
      }),
    );
  });
});
