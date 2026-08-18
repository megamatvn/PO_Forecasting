"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeCode, type BrandOptionDTO } from "../contracts";

export function BrandModal({ open, onClose, onCreated, onCreate }: { open: boolean; onClose: () => void; onCreated: (brand: BrandOptionDTO) => void; onCreate: (input: { code: string; name: string }) => Promise<BrandOptionDTO> }) {
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!open) return; firstRef.current?.focus(); const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [open, onClose]);
  if (!open) return null;
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!code.trim() || !name.trim()) { setError("Nhập đủ mã và tên nhãn hàng."); return; } setSaving(true); setError(null); try { onCreated(await onCreate({ code: normalizeCode(code), name: name.trim() })); setCode(""); setName(""); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể tạo nhãn hàng."); } finally { setSaving(false); } }
  return <div className="master-data-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="master-data-modal__panel" role="dialog" aria-modal="true" aria-label="Thêm nhãn hàng" onSubmit={submit}><p className="section-index">Dữ liệu nền</p><h2>Thêm nhãn hàng</h2><label><span>Mã nhãn hàng</span><input ref={firstRef} aria-label="Mã nhãn hàng" value={code} onChange={(event) => setCode(event.target.value)} placeholder="ET" /></label><label><span>Tên nhãn hàng</span><input aria-label="Tên nhãn hàng" value={name} onChange={(event) => setName(event.target.value)} placeholder="Etiaxil" /></label>{error ? <p role="alert" className="form-alert">{error}</p> : null}<footer><button type="button" className="button" onClick={onClose}>Hủy</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu nhãn hàng"}</button></footer></form></div>;
}
