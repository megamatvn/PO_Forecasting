"use client";

import { calculateAnnualLine } from "../domain/calculations";
import { TruncatedText } from "@/components/ui/truncated-text";
import type { ProductOptionDTO } from "@/features/master-data/contracts";

export interface AnnualLineRowModel {
  clientRowId: string;
  productId: string;
  exPrice: string;
  paidQty: number;
  expectedFoc: number;
  openingStock: number;
}

function numberFormat(value: number): string { return new Intl.NumberFormat("vi-VN").format(value); }
function moneyFormat(value: string): string { return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)); }

export function AnnualLineRow({ index, row, products, onChange, onRemove, canRemove }: { index: number; row: AnnualLineRowModel; products: ProductOptionDTO[]; onChange: (patch: Partial<AnnualLineRowModel>) => void; onRemove: () => void; canRemove: boolean }) {
  const selectedProduct = products.find((product) => product.id === row.productId);
  const calculated = calculateAnnualLine(row);
  return (
    <tr className="annual-line-row">
      <td className="annual-line-row__product">
        <select aria-label={`SKU dòng ${index + 1}`} value={row.productId} onChange={(event) => onChange({ productId: event.target.value })}>
          <option value="">Chọn SKU</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.canonicalSku}</option>)}
        </select>
        <span className="annual-line-row__name">{selectedProduct ? <TruncatedText>{selectedProduct.name}</TruncatedText> : "Chưa chọn sản phẩm"}</span>
      </td>
      <td><input aria-label={`Tồn đầu kỳ dòng ${index + 1}`} type="number" min="0" step="1" value={row.openingStock} onChange={(event) => onChange({ openingStock: Number(event.target.value) || 0 })} /></td>
      <td><input aria-label={`Số lượng dòng ${index + 1}`} type="number" min="0" step="1" value={row.paidQty} onChange={(event) => onChange({ paidQty: Number(event.target.value) || 0 })} /></td>
      <td><input aria-label={`FOC dòng ${index + 1}`} type="number" min="0" step="1" value={row.expectedFoc} onChange={(event) => onChange({ expectedFoc: Number(event.target.value) || 0 })} /></td>
      <td className="annual-line-row__calculated">{numberFormat(calculated.totalReceipts)}</td>
      <td><input aria-label={`Ex Price dòng ${index + 1}`} inputMode="decimal" value={row.exPrice} onChange={(event) => onChange({ exPrice: event.target.value })} /></td>
      <td className="annual-line-row__calculated">{moneyFormat(calculated.plannedAmount)}</td>
      <td><button type="button" className="button button--quiet" aria-label={`Xóa dòng ${index + 1}`} onClick={onRemove} disabled={!canRemove}>Xóa</button></td>
    </tr>
  );
}
