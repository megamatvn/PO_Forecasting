"use client";

import { AllocationMatrix, type AllocationMatrixLine, type AllocationMatrixWave } from "./allocation-matrix";

export interface PurchaseWaveEditorModel extends AllocationMatrixWave { name: string; orderMonth: string; arrivalMonth: string; status: "planned" | "ordered" | "supplier_confirmed" | "received" | "cancelled"; canDelete: boolean }

export function PurchaseWaveEditor({ wave, lines, onChange, onRemove }: { wave: PurchaseWaveEditorModel; lines: AllocationMatrixLine[]; onChange: (patch: Partial<PurchaseWaveEditorModel>) => void; onAllocationChange: (waveId: string, productId: string, patch: { paidQty?: number; focQty?: number }) => void; onRemove: () => void }) {
  return <article className="purchase-wave-editor" aria-labelledby={`purchase-wave-${wave.id}`}><header><div><p className="section-index">Đợt mua</p><h3 id={`purchase-wave-${wave.id}`}>PO #{wave.sequence}</h3></div><button type="button" className="button button--quiet" onClick={onRemove} disabled={!wave.canDelete}>{wave.canDelete ? "Xóa đợt mua" : "Không thể xóa"}</button></header><div className="purchase-wave-editor__dates"><label><span>Tháng đặt hàng</span><input aria-label={`Tháng đặt hàng PO ${wave.sequence}`} type="month" value={wave.orderMonth} onChange={(event) => onChange({ orderMonth: event.target.value })} /></label><label><span>Tháng hàng về</span><input aria-label={`Tháng hàng về PO ${wave.sequence}`} type="month" value={wave.arrivalMonth} onChange={(event) => onChange({ arrivalMonth: event.target.value })} /></label></div><AllocationMatrix lines={lines} waves={[wave]} onChange={(waveId, productId, patch) => onChange({ allocations: wave.allocations.map((allocation) => allocation.productId === productId ? { ...allocation, ...patch } : allocation) })} /></article>;
}
