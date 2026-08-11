import { describe, it } from "vitest";
import fc from "fast-check";
import { calculateAmount } from "@/lib/domain/money";
import { calculateClosingStock } from "@/lib/domain/stock";

describe("domain calculation properties", () => {
  it("always projects stock as opening plus active receipts minus demand", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        (openingStock, qty, focQty, demand) => {
          const closingStock = calculateClosingStock({
            openingStock,
            demand,
            qty,
            focQty,
            isCancelled: false,
          });

          return closingStock === openingStock + qty + focQty - demand;
        },
      ),
    );
  });

  it("always produces a zero Amount when Qty is zero", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (priceInCents) => {
        const exPrice = (priceInCents / 100).toFixed(2);
        return calculateAmount({ qty: 0, exPrice }) === "0.00";
      }),
    );
  });
});
