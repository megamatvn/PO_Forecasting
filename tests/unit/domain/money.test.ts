import { describe, expect, it } from "vitest";
import { calculateAmount } from "@/lib/domain/money";

describe("calculateAmount", () => {
  it("calculates Amount from Qty multiplied by Ex Price", () => {
    expect(calculateAmount({ qty: 2368, exPrice: "12.50" })).toBe("29600.00");
  });

  it("keeps decimal arithmetic exact for currency values", () => {
    expect(calculateAmount({ qty: 3, exPrice: "0.10" })).toBe("0.30");
  });
});
