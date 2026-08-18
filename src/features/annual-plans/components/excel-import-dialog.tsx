"use client";

import { useRef, useState } from "react";
import type { ExcelPreviewDTO } from "../excel/parser";

export interface ExcelImportDialogProps {
  open: boolean;
  revisionId: string;
  lockVersion: number;
  onClose: () => void;
  onPreview: (file: File) => Promise<ExcelPreviewDTO>;
  onApply: (input: { importSessionId: string; checksum: string; lockVersion: number; replaceSections: ["lines", "waves"]; idempotencyKey: string; payload: ExcelPreviewDTO }) => Promise<void>;
}

export function ExcelImportDialog({ open, lockVersion, onClose, onPreview, onApply }: ExcelImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ExcelPreviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null); setPreview(null); setReplaceConfirmed(false);
    try { setPreview(await onPreview(file)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể đọc file Excel."); } finally { setBusy(false); }
  }
  async function apply() {
    if (!preview || !preview.canApply || !replaceConfirmed) return;
    setBusy(true); setError(null);
    try { await onApply({ importSessionId: preview.importSessionId, checksum: preview.checksum, lockVersion, replaceSections: ["lines", "waves"], idempotencyKey: crypto.randomUUID(), payload: preview }); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể áp dụng file Excel."); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" role="presentation"><div className="modal excel-import-dialog" role="dialog" aria-modal="true" aria-labelledby="excel-import-dialog-title"><header><p className="section-index">Excel adapter</p><h2 id="excel-import-dialog-title">Nhập từ file mẫu</h2><p>File chỉ cập nhật bản nháp hiện tại sau khi bạn xác nhận thay thế.</p></header><label className="excel-import-dialog__file"><span>File Excel kế hoạch</span><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>{busy ? <p role="status">Đang kiểm tra file…</p> : null}{error ? <p className="form-alert" role="alert">{error}</p> : null}{preview ? <section className="excel-import-dialog__preview" aria-label="Xem trước file"><p><strong>{preview.brand.code} · {preview.brand.name}</strong> · {preview.planningYear}</p><p>{preview.lines.length} dòng SKU · {preview.waves.length} đợt mua · {preview.diagnostics.length} cảnh báo/lỗi</p><ul>{preview.lines.map((line) => <li key={`${line.sku}-${line.name}`}><span>{line.sku}</span>{line.name ? <> · {line.name}</> : null}</li>)}</ul>{preview.diagnostics.length ? <ul>{preview.diagnostics.map((diagnostic) => <li key={`${diagnostic.sheet}-${diagnostic.row}-${diagnostic.code}`}>{diagnostic.message}</li>)}</ul> : <p>File hợp lệ, sẵn sàng áp dụng.</p>}<label><input type="checkbox" aria-label="Tôi xác nhận thay thế dữ liệu SKU và đợt mua trong bản nháp" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} /> Tôi xác nhận thay thế dữ liệu SKU và đợt mua trong bản nháp</label></section> : null}<footer className="excel-import-dialog__actions"><button type="button" className="button" onClick={onClose}>Hủy</button><button type="button" className="button button--primary" disabled={!preview?.canApply || !replaceConfirmed || busy} onClick={() => void apply()}>Áp dụng thay thế</button></footer></div></div>;
}
