"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateRevisionButton({ revisionId, onCreate }: { revisionId: string; onCreate?: (revisionId: string) => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <button type="button" className="button button--primary" disabled={busy || !revisionId} onClick={async () => { setBusy(true); try { if (onCreate) { await onCreate(revisionId); router.refresh(); } else { const response = await fetch(`/api/v2/annual-plans/${revisionId}/revision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }); const body = await response.json() as { data?: { revisionId?: string }; error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message ?? "Không thể tạo phiên bản điều chỉnh."); if (body.data?.revisionId) router.push(`/annual-plans/${body.data.revisionId}?step=scope`); else router.refresh(); } } finally { setBusy(false); } }}>{busy ? "Đang tạo…" : "Tạo phiên bản điều chỉnh"}</button>;
}
