"use client";

import { useMemo, useState } from "react";
import { createIdempotencyKey } from "@/lib/idempotency";
import { validatePurchaseWavesStep, type AnnualLineInput, type PurchaseWaveInput } from "../domain/validation";
import { PurchaseWaveEditor, type PurchaseWaveEditorModel } from "./purchase-wave-editor";
import type { AllocationMatrixLine } from "./allocation-matrix";

export type PurchaseWaveLine = AllocationMatrixLine & { openingStock: number };
interface SaveResult { lockVersion: number; waves: PurchaseWaveEditorModel[] }

function month(year: number, index: number): string { return `${year}-${String(Math.min(12, Math.max(1, index))).padStart(2, "0")}`; }
function makeWave(year: number, sequence: number, lines: PurchaseWaveLine[]): PurchaseWaveEditorModel { return { id: `client-wave-${sequence}-${Math.random().toString(36).slice(2, 8)}`, sequence, name: `PO #${sequence}`, orderMonth: month(year, sequence), arrivalMonth: month(year, sequence), status: "planned", allocations: lines.map((line) => ({ productId: line.productId, paidQty: 0, focQty: 0, exPrice: line.exPrice })), canDelete: true }; }
function normalizeWave(wave: PurchaseWaveEditorModel, lines: PurchaseWaveLine[]): PurchaseWaveEditorModel { return { ...wave, allocations: lines.map((line) => wave.allocations.find((allocation) => allocation.productId === line.productId) ?? ({ productId: line.productId, paidQty: 0, focQty: 0, exPrice: line.exPrice })) }; }

export function PurchaseWaveStep({ planningYear, lines, initialWaves = [], lockVersion = 0, revisionId, onSave, onChange }: { planningYear: number; lines: PurchaseWaveLine[]; initialWaves?: PurchaseWaveEditorModel[]; lockVersion?: number; revisionId?: string; onSave?: (input: { lockVersion: number; waves: PurchaseWaveEditorModel[]; idempotencyKey: string }) => Promise<SaveResult>; onChange?: (waves: PurchaseWaveEditorModel[]) => void }) {
  const [waves, setWaves] = useState<PurchaseWaveEditorModel[]>(initialWaves.length ? initialWaves.map((wave) => normalizeWave(wave, lines)) : [makeWave(planningYear, 1, lines)]);
  const [currentLockVersion, setCurrentLockVersion] = useState(lockVersion);
  const [error, setError] = useState<string | null>(null);
  const linesForValidation = lines.map((line): AnnualLineInput => ({ productId: line.productId, exPrice: line.exPrice, paidQty: line.annualPaidQty, expectedFoc: line.annualFocQty, openingStock: line.openingStock }));
  const wavesForValidation = waves.map((wave): PurchaseWaveInput => ({ waveId: wave.id, waveNumber: wave.sequence, orderMonth: wave.orderMonth, arrivalMonth: wave.arrivalMonth, allocations: wave.allocations }));
  const validation = validatePurchaseWavesStep(linesForValidation, wavesForValidation, planningYear);

  function replaceWaves(next: PurchaseWaveEditorModel[]) { setWaves(next); onChange?.(next); }
  function updateWave(id: string, patch: Partial<PurchaseWaveEditorModel>) { replaceWaves(waves.map((wave) => wave.id === id ? { ...wave, ...patch } : wave)); }
  function updateAllocation(waveId: string, productId: string, patch: { paidQty?: number; focQty?: number }) { replaceWaves(waves.map((wave) => { if (wave.id !== waveId) return wave; const existing = wave.allocations.find((allocation) => allocation.productId === productId); const line = lines.find((item) => item.productId === productId); const nextAllocation = { productId, paidQty: existing?.paidQty ?? 0, focQty: existing?.focQty ?? 0, exPrice: existing?.exPrice ?? line?.exPrice ?? "0", ...patch }; return { ...wave, allocations: existing ? wave.allocations.map((allocation) => allocation.productId === productId ? nextAllocation : allocation) : [...wave.allocations, nextAllocation] }; })); }
  function addWave() { const sequence = waves.reduce((max, wave) => Math.max(max, wave.sequence), 0) + 1; replaceWaves([...waves, makeWave(planningYear, sequence, lines)]); }
  function removeWave(id: string) { replaceWaves(waves.filter((wave) => wave.id !== id)); }
  async function save() { if (!validation.valid) { setError(validation.errors[0] ?? "Phân bổ chưa khớp kế hoạch năm."); return; } if (!revisionId && !onSave) { setError("Bản nháp chưa có mã để lưu."); return; } setError(null); try { const payload = { lockVersion: currentLockVersion, waves, idempotencyKey: createIdempotencyKey() }; if (onSave) { const result = await onSave(payload); setCurrentLockVersion(result.lockVersion); if (result.waves.length) replaceWaves(result.waves); } else { const response = await fetch(`/api/v2/annual-plans/${revisionId}/waves`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json() as { data?: { lockVersion?: number; waves?: PurchaseWaveEditorModel[] }; error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message ?? "Không thể lưu phân bổ."); if (typeof body.data?.lockVersion === "number") setCurrentLockVersion(body.data.lockVersion); if (body.data?.waves?.length) replaceWaves(body.data.waves); } } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu phân bổ."); } }

  const matrixLines = useMemo(() => lines as AllocationMatrixLine[], [lines]);
  return <section className="purchase-wave-step" aria-labelledby="purchase-wave-step-title"><header className="purchase-wave-step__header"><div><p className="section-index">Bước 3 · Đợt mua</p><h2 id="purchase-wave-step-title">Phân bổ Qty và FOC theo từng PO</h2><p>Tổng Qty và FOC của tất cả PO phải khớp kế hoạch mua cả năm.</p></div><button type="button" className="button" onClick={addWave}>Thêm đợt mua</button></header>{error ? <p className="form-alert" role="alert">{error}</p> : null}{!validation.valid ? <p className="form-alert" role="alert">{validation.errors[0]}</p> : null}<div className="purchase-wave-step__editors">{waves.map((wave) => <PurchaseWaveEditor key={wave.id} wave={wave} lines={matrixLines} onChange={(patch) => updateWave(wave.id, patch)} onAllocationChange={updateAllocation} onRemove={() => removeWave(wave.id)} />)}</div><footer className="purchase-wave-step__footer"><span>{waves.length} đợt mua · {validation.valid ? "Đã khớp kế hoạch năm" : "Chưa khớp Qty/FOC"}</span><button type="button" className="button button--primary" onClick={save} disabled={!validation.valid}>Lưu phân bổ</button></footer></section>;
}
