import Decimal from "decimal.js";
import type { MoneyInput } from "@/lib/domain/types";

export function calculateAmount({ qty, exPrice }: MoneyInput): string {
  return new Decimal(qty).mul(new Decimal(exPrice)).toFixed(2);
}
