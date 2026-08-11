import { describe, expect, it } from "vitest";
import { calculateClosingStock, calculateShortage } from "@/lib/domain/stock";

describe("stock calculations", () => {
  it("projects ET-015150 to a shortage of 2,368 without future receipts", () => {
    const closingStock = calculateClosingStock({
      openingStock: 32,
      demand: 2400,
      qty: 0,
      focQty: 0,
      isCancelled: false,
    });

    expect(closingStock).toBe(-2368);
    expect(calculateShortage(closingStock, 0)).toBe(2368);
  });

  it("adds FOC to stock but excludes a cancelled purchase batch", () => {
    expect(
      calculateClosingStock({
        openingStock: 10,
        demand: 4,
        qty: 5,
        focQty: 2,
        isCancelled: false,
      }),
    ).toBe(13);

    expect(
      calculateClosingStock({
        openingStock: 10,
        demand: 4,
        qty: 5,
        focQty: 2,
        isCancelled: true,
      }),
    ).toBe(6);
  });
});
