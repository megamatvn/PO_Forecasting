"use client";

import type { OrgTier } from "@/features/organization/contracts";

export interface ReportingCandidate { id: string; displayName: string; isActive: boolean; tier: OrgTier }

export function ReportingLineSelect({ tier, value, candidates, currentUserId, onChange }: { tier: OrgTier; value: string | null; candidates: ReportingCandidate[]; currentUserId?: string; onChange: (value: string | null) => void }) {
  const expectedTier = tier === "leader" ? "manager" : tier === "manager" ? "executive" : null;
  const options = candidates.filter((candidate) => candidate.id !== currentUserId && candidate.isActive && candidate.tier === expectedTier);
  const required = tier === "leader" || tier === "manager";
  return (
    <label className="organization-field">
      <span>Người quản lý trực tiếp{required ? " *" : ""}</span>
      <select aria-label="Người quản lý trực tiếp" value={value ?? ""} disabled={!required} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{required ? "Chọn người quản lý" : "Không áp dụng"}</option>
        {options.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName}</option>)}
      </select>
    </label>
  );
}
