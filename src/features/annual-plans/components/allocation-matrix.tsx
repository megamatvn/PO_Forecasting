"use client";

import Decimal from "decimal.js";

export interface AllocationMatrixLine { productId: string; canonicalSku: string; productName: string; exPrice: string; annualPaidQty: number; annualFocQty: number }
export interface AllocationMatrixWave { id: string; sequence: number; allocations: Array<{ productId: string; paidQty: number; focQty: number; exPrice: string }> }

function amount(qty: number, price: string): string { return new Decimal(qty).mul(price || "0").toFixed(2); }

export function AllocationMatrix({ lines, waves, onChange }: { lines: AllocationMatrixLine[]; waves: AllocationMatrixWave[]; onChange: (waveId: string, productId: string, patch: { paidQty?: number; focQty?: number }) => void }) {
  return (
    <div className="allocation-matrix-wrap">
      <table className="allocation-matrix" aria-label="Ma trận phân bổ theo đợt mua">
        <thead><tr><th scope="col">SKU</th>{waves.map((wave) => <th key={wave.id} scope="col">PO #{wave.sequence}<span>Qty / FOC</span></th>)}</tr></thead>
        <tbody>{lines.map((line) => <tr key={line.productId}><th scope="row"><strong>{line.canonicalSku}</strong><span>{line.productName}</span></th>{waves.map((wave) => { const allocation = wave.allocations.find((item) => item.productId === line.productId) ?? { productId: line.productId, paidQty: 0, focQty: 0, exPrice: line.exPrice }; return <td key={`${wave.id}-${line.productId}`}><div className="allocation-cell"><label><span>Qty</span><input aria-label={`Qty ${line.canonicalSku} PO ${wave.sequence}`} type="number" min="0" step="1" value={allocation.paidQty} onChange={(event) => onChange(wave.id, line.productId, { paidQty: Number(event.target.value) || 0 })} /></label><label><span>FOC</span><input aria-label={`FOC ${line.canonicalSku} PO ${wave.sequence}`} type="number" min="0" step="1" value={allocation.focQty} onChange={(event) => onChange(wave.id, line.productId, { focQty: Number(event.target.value) || 0 })} /></label><small>{amount(allocation.paidQty, line.exPrice)} €</small></div></td>; })}</tr>)}</tbody>
        <tfoot><tr><th scope="row">Tổng phân bổ</th>{waves.map((wave) => <td key={`total-${wave.id}`}>{wave.allocations.reduce((sum, item) => sum + item.paidQty, 0).toLocaleString("vi-VN")} Qty · {wave.allocations.reduce((sum, item) => sum + item.focQty, 0).toLocaleString("vi-VN")} FOC</td>)}</tr></tfoot>
      </table>
      <div className="allocation-matrix__summary">{lines.map((line) => { const paid = waves.flatMap((wave) => wave.allocations).filter((item) => item.productId === line.productId).reduce((sum, item) => sum + item.paidQty, 0); const foc = waves.flatMap((wave) => wave.allocations).filter((item) => item.productId === line.productId).reduce((sum, item) => sum + item.focQty, 0); return <p key={line.productId}><strong>{line.canonicalSku}</strong> · Đã phân bổ Qty {paid.toLocaleString("vi-VN")} / Kế hoạch năm {line.annualPaidQty.toLocaleString("vi-VN")} / Còn lại {(line.annualPaidQty - paid).toLocaleString("vi-VN")} · FOC {foc.toLocaleString("vi-VN")} / {line.annualFocQty.toLocaleString("vi-VN")}</p>; })}</div>
    </div>
  );
}
