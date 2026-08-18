"use client";

import { useState } from "react";
import { normalizeLoginEmail } from "@/features/auth/email";
import { orgTiers, type Capability, type OrgTier } from "@/features/organization/contracts";
import type { ReportingCandidate } from "./reporting-line-select";
import { ReportingLineSelect } from "./reporting-line-select";

export interface CreateAccountInput { email: string; emailPrefix?: string; displayName: string; password: string; tier: OrgTier; supervisorId: string | null; capabilities: Capability[]; brandIds: string[]; idempotencyKey?: string }

export function CreateAccountDialog({ supervisors, onCreate }: { supervisors: ReportingCandidate[]; onCreate: (input: CreateAccountInput) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [tier, setTier] = useState<OrgTier>("employee_viewer");
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function close() { if (!saving) { setOpen(false); setMessage(null); } }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage(null);
    if (!prefix.trim() || prefix.includes("@")) return setMessage("Chỉ nhập phần tiền tố email nội bộ.");
    if (!displayName.trim() || password.length < 8) return setMessage("Cần nhập tên hiển thị và mật khẩu tối thiểu 8 ký tự.");
    if ((tier === "leader" || tier === "manager") && !supervisorId) return setMessage("Bắt buộc chọn người quản lý trực tiếp.");
    setSaving(true);
    try { await onCreate({ email: normalizeLoginEmail(prefix), emailPrefix: prefix.trim(), displayName: displayName.trim(), password, tier, supervisorId: tier === "leader" || tier === "manager" ? supervisorId : null, capabilities: [], brandIds: [] }); close(); setPrefix(""); setDisplayName(""); setPassword(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tạo tài khoản."); }
    finally { setSaving(false); }
  }
  return <>
    <button type="button" className="button button--primary" onClick={() => setOpen(true)}>Tạo tài khoản</button>
    {open ? <div className="organization-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form className="organization-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="create-account-title" onSubmit={submit}>
        <header><p className="section-index">Tài khoản nội bộ</p><h2 id="create-account-title">Tạo tài khoản mới</h2><p>Hệ thống tự bổ sung @sagen-groupe.com.</p></header>
        <label className="organization-field"><span>Tiền tố email *</span><input aria-label="Tiền tố email" value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="nguyen.an" autoFocus /></label>
        <label className="organization-field"><span>Tên hiển thị *</span><input aria-label="Tên hiển thị" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label className="organization-field"><span>Mật khẩu khởi tạo *</span><input aria-label="Mật khẩu khởi tạo" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="organization-field"><span>Cấp tổ chức *</span><select aria-label="Cấp tổ chức" value={tier} onChange={(event) => { setTier(event.target.value as OrgTier); setSupervisorId(null); }}>{orgTiers.map((item) => <option key={item} value={item}>{item === "employee_viewer" ? "Nhân viên / chỉ xem" : item === "leader" ? "Leader" : item === "manager" ? "Manager" : "CEO / BOD"}</option>)}</select></label>
        <ReportingLineSelect tier={tier} value={supervisorId} candidates={supervisors} onChange={setSupervisorId} />
        {message ? <p className="form-alert" role="alert">{message}</p> : null}
        <footer><button type="button" className="button" onClick={close}>Hủy</button><button type="submit" className="button button--primary">{saving ? "Đang tạo…" : "Tạo tài khoản mới"}</button></footer>
      </form>
    </div> : null}
  </>;
}
