"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CreateRevisionButtonProps {
  planVersionId: string;
  cycleId: string;
}

export function CreateRevisionButton({
  planVersionId,
  cycleId,
}: CreateRevisionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRevision() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/planning/${planVersionId}/revision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planVersionId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as { revisionId?: string; message?: string };
      if (!response.ok || !payload.revisionId) {
        throw new Error(payload.message ?? "revision_failed");
      }
      router.push(`/planning/${cycleId}?versionId=${payload.revisionId}`);
    } catch {
      setError("Không thể tạo phiên bản chỉnh sửa. Vui lòng thử lại.");
      setLoading(false);
    }
  }

  return (
    <div className="revision-action">
      <button
        className="button button--primary"
        type="button"
        disabled={loading}
        onClick={() => void createRevision()}
      >
        {loading ? "Đang tạo revision…" : "Tạo revision để chỉnh sửa"}
      </button>
      {error ? <span className="form-alert form-alert--error">{error}</span> : null}
    </div>
  );
}
