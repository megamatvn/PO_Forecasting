import { describe, expect, it } from "vitest";
import { canonicalizeSku } from "@/lib/domain/sku";

describe("canonicalizeSku", () => {
  const aliases = new Map([
    ["ET-015025", "ET-015025"],
    ["ET-015026", "ET-015025"],
    ["ET-015027", "ET-015025"],
  ]);

  it.each(["ET-015025", "ET-015026", "ET-015027"])(
    "maps Đặc trị xanh alias %s to ET-015025",
    (rawSku) => {
      expect(canonicalizeSku(rawSku, aliases)).toBe("ET-015025");
    },
  );

  it("normalizes whitespace and letter case before looking up an alias", () => {
    expect(canonicalizeSku(" et-015027 ", aliases)).toBe("ET-015025");
  });
});
