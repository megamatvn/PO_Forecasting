"use client";

import { useState } from "react";

interface PurchaseWaveOperationFormProps {
  waveId: string;
  status: string;
  officialPoNumber: string | null;
  orderedAt: string | null;
  supplierConfirmedAt: string | null;
  receivedAt: string | null;
}

const transitions: Record<string, { value: string; label: string } | null> = {
  planned: { value: "ordered", label: "Ghi nhận đã đặt hàng" },
  ordered: { value: "supplier_confirmed", label: "Ghi nhận nhà cung cấp xác nhận" },
  supplier_confirmed: { value: "received", label: "Ghi nhận đã nhận hàng" },
  received: null,
  cancelled: null,
};

const statusLabels: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  ordered: "Đã đặt hàng",
  supplier_confirmed: "Nhà cung cấp xác nhận",
  received: "Đã nhận hàng",
  cancelled: "Đã hủy",
};

export function PurchaseWaveOperationForm(props: PurchaseWaveOperationFormProps) {
  const [status, setStatus] = useState(props.status);
  const [officialPoNumber, setOfficialPoNumber] = useState(props.officialPoNumber ?? "");
  const [orderedAt, setOrderedAt] = useState(props.orderedAt ?? "");
  const [supplierConfirmedAt, setSupplierConfirmedAt] = useState(props.supplierConfirmedAt ?? "");
  const [receivedAt, setReceivedAt] = useState(props.receivedAt ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const transition = transitions[status] ?? null;

  async function submit(nextStatus: string) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v2/purchase-waves/${encodeURIComponent(props.waveId)}/operations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: nextStatus, officialPoNumber, orderedAt: orderedAt || null, supplierConfirmedAt: supplierConfirmedAt || null, receivedAt: receivedAt || null, reassignments: [], idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json() as { ok?: boolean; data?: { status?: string }; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Không thể cập nhật đợt mua.");
      setStatus(payload.data?.status ?? nextStatus);
      setMessage("Đã lưu trạng thái đợt mua.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật đợt mua.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="v2-wave-operation" aria-labelledby="wave-operation-title">
      <div className="v2-dashboard-panel__header"><div><p className="section-index">Cập nhật thực tế</p><h2 id="wave-operation-title">Vận hành đợt mua</h2></div><span>{statusLabels[status] ?? status}</span></div>
      <div className="v2-wave-operation__fields">
        <label>Số PO chính thức<input value={officialPoNumber} onChange={(event) => setOfficialPoNumber(event.target.value)} placeholder="Ví dụ: PO-2026-001" /></label>
        <label>Ngày đặt hàng<input type="date" value={orderedAt} onChange={(event) => setOrderedAt(event.target.value)} /></label>
        <label>Ngày nhà cung cấp xác nhận<input type="date" value={supplierConfirmedAt} onChange={(event) => setSupplierConfirmedAt(event.target.value)} /></label>
        <label>Ngày nhận hàng<input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></label>
      </div>
      <div className="v2-wave-operation__actions">
        {transition ? <button className="button button--primary" type="button" disabled={saving} onClick={() => submit(transition.value)}>{saving ? "Đang lưu…" : transition.label}</button> : <span className="muted-copy">Đợt mua này đã ở trạng thái cuối.</span>}
        {status !== "received" && status !== "cancelled" ? <button className="button" type="button" disabled={saving} onClick={() => submit("cancelled")}>Hủy đợt mua</button> : null}
      </div>
      {message ? <p className="form-alert" role="status">{message}</p> : null}
    </section>
  );
}
