"use client";

import { PolicyEditor, type ApprovalPolicyDraft } from "./policy-editor";
import type { BrandAccess } from "@/features/auth/access-types";

export interface ProposalPolicyEditorProps {
  brands: BrandAccess[];
}

/**
 * Proposal policies use the same guided, keyboard-accessible editor as the
 * legacy approval surface, but persist through the versioned V2 command.
 */
export function ProposalPolicyEditor({ brands }: ProposalPolicyEditorProps) {
  async function save(policy: ApprovalPolicyDraft) {
    const response = await fetch("/api/v2/admin/proposal-policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...policy, idempotencyKey: crypto.randomUUID() }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
      throw new Error(body?.error?.message ?? body?.message ?? "Không thể lưu chính sách đề xuất.");
    }
    window.location.reload();
  }

  return <section aria-label="Chính sách duyệt đề xuất"><PolicyEditor brands={brands} onSave={save} /></section>;
}
