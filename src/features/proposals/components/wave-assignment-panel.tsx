"use client";

import type { ProposalWaveDTO } from "../server/load-proposals";

export function WaveAssignmentPanel({ waves, selectedWaveId, onChange, disabled = false }: { waves: ProposalWaveDTO[]; selectedWaveId?: string; onChange: (waveId: string) => void; disabled?: boolean }) {
  return <label className="wave-assignment-panel">PO ghi nhận<select aria-label="PO ghi nhận" value={selectedWaveId ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}><option value="">Chọn PO để ghi nhận</option>{waves.map((wave) => <option key={wave.id} value={wave.id}>PO #{wave.sequence} · tháng {wave.neededMonth}</option>)}</select></label>;
}
