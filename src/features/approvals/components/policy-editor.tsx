"use client";

import { useState, type FormEvent } from "react";
import type { BrandAccess } from "@/features/auth/access-types";
import type { ApprovalMode } from "@/lib/domain/types";

export interface ApprovalPolicyDraft {
  name: string;
  mode: ApprovalMode;
  thresholdAmount: string | null;
  currencyCode: string;
  brandIds: string[];
  escalationFlags: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface PolicyEditorProps {
  brands: BrandAccess[];
  onSave?(policy: ApprovalPolicyDraft): Promise<void>;
}

export function PolicyEditor({ brands, onSave }: PolicyEditorProps) {
  const [mode, setMode] = useState<ApprovalMode>("fixed_two_level");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePolicy(policy: ApprovalPolicyDraft) {
    if (onSave) return onSave(policy);

    const response = await fetch("/api/admin/approval-policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(policy),
    });
    if (!response.ok) throw new Error("approval_policy_save_failed");
    window.location.reload();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      await savePolicy({
        name: String(formData.get("name") ?? "").trim(),
        mode,
        thresholdAmount:
          mode === "threshold" ? String(formData.get("thresholdAmount")) : null,
        currencyCode: String(formData.get("currencyCode") ?? "EUR"),
        brandIds: selectedBrands,
        escalationFlags: formData.getAll("escalationFlags").map(String),
        effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
        effectiveTo: String(formData.get("effectiveTo") || "") || null,
      });
      setSaved(true);
    } catch {
      setError("Không thể lưu chính sách. Cấu hình hiện tại chưa bị thay đổi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="policy-editor" onSubmit={(event) => void submit(event)}>
      <section>
        <p className="section-index">01 · Phạm vi</p>
        <h2>Áp dụng cho nhãn hàng</h2>
        <div className="policy-brand-grid">
          {brands.map((brand) => (
            <label key={brand.id}>
              <input
                type="checkbox"
                aria-label={`${brand.code} · ${brand.name}`}
                checked={selectedBrands.includes(brand.id)}
                onChange={(event) =>
                  setSelectedBrands((current) =>
                    event.target.checked
                      ? [...current, brand.id]
                      : current.filter((id) => id !== brand.id),
                  )
                }
              />
              <span>
                <strong>{brand.code}</strong>
                <small>{brand.name}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <p className="section-index">02 · Cách định tuyến</p>
        <h2>Thiết lập cấp duyệt</h2>
        <div className="field-group">
          <label htmlFor="policy-name">Tên chính sách</label>
          <input id="policy-name" name="name" required />
        </div>
        <div className="policy-mode-options">
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "fixed_two_level"}
              onChange={() => setMode("fixed_two_level")}
            />
            <span>
              <strong>Duyệt 2 cấp bắt buộc</strong>
              <small>Mặc định: Manager → CFO/CEO cho mọi kế hoạch.</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "threshold"}
              onChange={() => setMode("threshold")}
            />
            <span>
              <strong>Duyệt theo hạn mức</strong>
              <small>Dưới hạn mức duyệt 1 cấp; đạt hạn mức duyệt 2 cấp.</small>
            </span>
          </label>
        </div>

        <div className="policy-money-fields">
          <label className="field-group">
            <span>Tiền tệ</span>
            <select name="currencyCode" defaultValue="EUR">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="VND">VND</option>
            </select>
          </label>
          {mode === "threshold" ? (
            <label className="field-group">
              <span>Hạn mức chuyển 2 cấp</span>
              <input
                name="thresholdAmount"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
          ) : null}
        </div>
      </section>

      <section>
        <p className="section-index">03 · Ngoại lệ & hiệu lực</p>
        <h2>Điều kiện escalated</h2>
        <div className="policy-exception-list">
          {[
            ["criticalShortage", "Có SKU Critical"],
            ["budgetOverrun", "Vượt ngân sách kế hoạch"],
            ["newSupplier", "Có nhà cung cấp mới"],
          ].map(([value, label]) => (
            <label key={value}>
              <input type="checkbox" name="escalationFlags" value={value} />
              {label}
            </label>
          ))}
        </div>
        <div className="policy-date-fields">
          <label className="field-group">
            <span>Hiệu lực từ</span>
            <input name="effectiveFrom" type="date" required />
          </label>
          <label className="field-group">
            <span>Hiệu lực đến</span>
            <input name="effectiveTo" type="date" />
          </label>
        </div>
      </section>

      <aside className="policy-inflight-note">
        <strong>Không thay đổi hồ sơ đang duyệt</strong>
        <p>
          Mỗi hồ sơ giữ snapshot chính sách tại thời điểm gửi. Cấu hình mới chỉ
          áp dụng cho lần gửi duyệt tiếp theo.
        </p>
      </aside>

      <footer>
        {error ? (
          <span className="form-alert form-alert--error" role="alert">
            {error}
          </span>
        ) : saved ? (
          <span role="status">Đã lưu chính sách mới.</span>
        ) : (
          <span />
        )}
        <button
          className="button button--primary"
          type="submit"
          disabled={saving || selectedBrands.length === 0}
        >
          {saving ? "Đang lưu…" : "Lưu và áp dụng"}
        </button>
      </footer>
    </form>
  );
}
