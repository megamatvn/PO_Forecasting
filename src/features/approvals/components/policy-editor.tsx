"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BrandAccess } from "@/features/auth/access-types";
import { PolicySummary } from "@/features/approvals/components/policy-summary";
import {
  createApprovalPolicyDraft,
  type ApprovalEscalationFlag,
  type ApprovalPolicyDraft,
} from "@/features/approvals/domain/policy-summary";
import type { ApprovalMode } from "@/lib/domain/types";

export type { ApprovalPolicyDraft } from "@/features/approvals/domain/policy-summary";

interface PolicyEditorProps {
  brands: BrandAccess[];
  onSave?(policy: ApprovalPolicyDraft): Promise<void>;
}

type DraftField = keyof ApprovalPolicyDraft;
type FieldErrors = Partial<Record<DraftField | "form", string>>;
type PolicySection = "scope" | "route" | "exceptions";
type FocusTarget = "brandIds" | "name" | "thresholdAmount" | "effectiveFrom" | "effectiveTo";

const escalationOptions: Array<{
  value: ApprovalEscalationFlag;
  label: string;
}> = [
  { value: "criticalShortage", label: "Có sản phẩm thiếu hàng khẩn cấp" },
  { value: "budgetOverrun", label: "Vượt ngân sách kế hoạch" },
  { value: "newSupplier", label: "Có nhà cung cấp mới" },
];

function validateDraft(draft: ApprovalPolicyDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.brandIds.length) errors.brandIds = "Chọn ít nhất một nhãn hàng áp dụng.";
  if (!draft.name.trim()) errors.name = "Nhập tên chính sách.";
  if (draft.mode === "threshold" && !draft.thresholdAmount) {
    errors.thresholdAmount = "Nhập hạn mức chuyển 2 cấp.";
  }
  if (!draft.effectiveFrom) errors.effectiveFrom = "Chọn ngày bắt đầu hiệu lực.";
  if (draft.effectiveFrom && draft.effectiveTo && draft.effectiveTo < draft.effectiveFrom) {
    errors.effectiveTo = "Ngày kết thúc phải sau ngày bắt đầu.";
  }
  return errors;
}

export function PolicyEditor({ brands, onSave }: PolicyEditorProps) {
  const [draft, setDraft] = useState<ApprovalPolicyDraft>(createApprovalPolicyDraft);
  const [activeSection, setActiveSection] = useState<PolicySection>("scope");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const brandFieldRef = useRef<HTMLInputElement>(null);
  const thresholdFieldRef = useRef<HTMLInputElement>(null);
  const effectiveFromFieldRef = useRef<HTMLInputElement>(null);
  const effectiveToFieldRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef<FocusTarget | null>(null);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    const refs = {
      brandIds: brandFieldRef,
      name: firstFieldRef,
      thresholdAmount: thresholdFieldRef,
      effectiveFrom: effectiveFromFieldRef,
      effectiveTo: effectiveToFieldRef,
    };
    const element = refs[target].current;
    if (element) {
      element.focus();
      pendingFocusRef.current = null;
    }
  }, [activeSection, errors]);

  function updateDraft<Field extends DraftField>(
    field: Field,
    value: ApprovalPolicyDraft[Field],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
    setSaved(false);
  }

  function toggleBrand(brandId: string, checked: boolean) {
    updateDraft(
      "brandIds",
      checked
        ? [...draft.brandIds, brandId]
        : draft.brandIds.filter((id) => id !== brandId),
    );
  }

  function toggleEscalation(flag: ApprovalEscalationFlag, checked: boolean) {
    updateDraft(
      "escalationFlags",
      checked
        ? [...draft.escalationFlags, flag]
        : draft.escalationFlags.filter((current) => current !== flag),
    );
  }

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

  function showInvalidSection(nextErrors: FieldErrors) {
    if (nextErrors.brandIds && brands.length > 0) {
      pendingFocusRef.current = "brandIds";
      setActiveSection("scope");
      return;
    }
    if (nextErrors.name || nextErrors.thresholdAmount) {
      pendingFocusRef.current = nextErrors.name ? "name" : "thresholdAmount";
      setActiveSection("route");
      return;
    }
    if (nextErrors.effectiveFrom || nextErrors.effectiveTo) {
      pendingFocusRef.current = nextErrors.effectiveFrom ? "effectiveFrom" : "effectiveTo";
      setActiveSection("exceptions");
    }
  }

  function continueToRoute() {
    if (!draft.brandIds.length) {
      const nextErrors = { brandIds: "Chọn ít nhất một nhãn hàng áp dụng." };
      setErrors((current) => ({ ...current, ...nextErrors }));
      pendingFocusRef.current = "brandIds";
      return;
    }
    setErrors((current) => ({ ...current, brandIds: undefined }));
    setActiveSection("route");
  }

  function continueToExceptions() {
    const nextErrors: FieldErrors = {};
    if (!draft.name.trim()) nextErrors.name = "Nhập tên chính sách.";
    if (draft.mode === "threshold" && !draft.thresholdAmount) {
      nextErrors.thresholdAmount = "Nhập hạn mức chuyển 2 cấp.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors((current) => ({ ...current, ...nextErrors }));
      pendingFocusRef.current = nextErrors.name ? "name" : "thresholdAmount";
      return;
    }
    setErrors((current) => ({
      ...current,
      name: undefined,
      thresholdAmount: undefined,
    }));
    setActiveSection("exceptions");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateDraft(draft);
    if (Object.keys(nextErrors).length) {
      setErrors({ ...nextErrors, form: "Vui lòng kiểm tra các trường cần thiết." });
      showInvalidSection(nextErrors);
      return;
    }

    setSaving(true);
    setSaved(false);
    setErrors({});
    try {
      await savePolicy(draft);
      setSaved(true);
    } catch {
      setErrors({ form: "Không thể lưu chính sách. Cấu hình hiện tại chưa bị thay đổi." });
    } finally {
      setSaving(false);
    }
  }

  const isScopeComplete = draft.brandIds.length > 0;
  const isRouteComplete = Boolean(
    draft.name.trim() &&
      (draft.mode === "fixed_two_level" || draft.thresholdAmount),
  );
  const isExceptionComplete = Boolean(draft.effectiveFrom);

  return (
    <form className="policy-editor" noValidate onSubmit={(event) => void submit(event)}>
      {errors.form ? (
        <div
          className="form-alert form-alert--error"
          role="alert"
          aria-label="Vui lòng kiểm tra các trường cần thiết"
          tabIndex={-1}
        >
          {errors.form}
        </div>
      ) : null}

      <section
        className="policy-section"
        aria-labelledby="policy-scope-heading"
        data-active={activeSection === "scope" || undefined}
      >
        <header className="policy-section__header">
          <div>
            <p className="section-index">01 · Phạm vi</p>
            <h2 id="policy-scope-heading">Áp dụng cho nhãn hàng</h2>
          </div>
          <button
            type="button"
            aria-expanded={activeSection === "scope"}
            onClick={() => setActiveSection("scope")}
          >
            {activeSection === "scope" ? "Đang chỉnh sửa phạm vi" : "Chỉnh sửa phạm vi"}
          </button>
        </header>
        {activeSection === "scope" ? (
          <div className="policy-section__body">
            {errors.brandIds ? <p className="field-error" id="policy-brands-error">{errors.brandIds}</p> : null}
            <div className="policy-brand-grid" aria-describedby={errors.brandIds ? "policy-brands-error" : undefined}>
              {brands.map((brand, index) => (
                <label key={brand.id}>
                  <input
                    ref={index === 0 ? brandFieldRef : undefined}
                    type="checkbox"
                    aria-label={`${brand.code} · ${brand.name}`}
                    checked={draft.brandIds.includes(brand.id)}
                    onChange={(event) => toggleBrand(brand.id, event.target.checked)}
                  />
                  <span><strong>{brand.code}</strong><small>{brand.name}</small></span>
                </label>
              ))}
            </div>
            <div className="policy-section__next">
              <button className="button" type="button" onClick={continueToRoute}>
                Tiếp tục đến tuyến duyệt
              </button>
            </div>
          </div>
        ) : (
          <p className="policy-section__collapsed">
            {isScopeComplete ? `${draft.brandIds.length} nhãn hàng đã chọn` : "Chưa chọn nhãn hàng"}
          </p>
        )}
      </section>

      <section
        className="policy-section"
        aria-labelledby="policy-route-heading"
        data-active={activeSection === "route" || undefined}
      >
        <header className="policy-section__header">
          <div>
            <p className="section-index">02 · Tuyến duyệt</p>
            <h2 id="policy-route-heading">Thiết lập cấp duyệt</h2>
          </div>
          <button
            type="button"
            aria-expanded={activeSection === "route"}
            onClick={() => setActiveSection("route")}
          >
            {activeSection === "route" ? "Đang chỉnh sửa tuyến duyệt" : "Chỉnh sửa tuyến duyệt"}
          </button>
        </header>
        {activeSection === "route" ? (
          <div className="policy-section__body">
            <div className="field-group">
              <label htmlFor="policy-name">Tên chính sách</label>
              <input
                ref={firstFieldRef}
                id="policy-name"
                name="name"
                value={draft.name}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "policy-name-error" : undefined}
                onChange={(event) => updateDraft("name", event.target.value)}
              />
              {errors.name ? <p className="field-error" id="policy-name-error">{errors.name}</p> : null}
            </div>
            <div className="policy-mode-options">
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={draft.mode === "fixed_two_level"}
                  onChange={() => {
                    updateDraft("mode", "fixed_two_level");
                    updateDraft("thresholdAmount", null);
                  }}
                />
                <span>
                  <strong>Duyệt 2 cấp bắt buộc</strong>
                  <small>Mặc định: Quản lý nhãn hàng → Ban điều hành.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={draft.mode === "threshold"}
                  onChange={() => updateDraft("mode", "threshold" as ApprovalMode)}
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
                <select name="currencyCode" value={draft.currencyCode} onChange={(event) => updateDraft("currencyCode", event.target.value)}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="VND">VND</option>
                </select>
              </label>
              {draft.mode === "threshold" ? (
                <label className="field-group">
                  <span>Hạn mức chuyển 2 cấp</span>
                  <input
                    ref={thresholdFieldRef}
                    name="thresholdAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.thresholdAmount ?? ""}
                    aria-invalid={Boolean(errors.thresholdAmount)}
                    aria-describedby={errors.thresholdAmount ? "policy-threshold-error" : undefined}
                    onChange={(event) => updateDraft("thresholdAmount", event.target.value || null)}
                  />
                  {errors.thresholdAmount ? <p className="field-error" id="policy-threshold-error">{errors.thresholdAmount}</p> : null}
                </label>
              ) : null}
            </div>
            <div className="policy-section__next">
              <button className="button" type="button" onClick={continueToExceptions}>
                Tiếp tục đến ngoại lệ và hiệu lực
              </button>
            </div>
          </div>
        ) : (
          <p className="policy-section__collapsed">
            {isRouteComplete ? (
              <>
                <span>{draft.name}</span>
                <span>
                  {draft.mode === "fixed_two_level"
                    ? "Duyệt 2 cấp bắt buộc"
                    : "Duyệt theo hạn mức"}
                </span>
              </>
            ) : "Chưa hoàn tất tuyến duyệt"}
          </p>
        )}
      </section>

      <section
        className="policy-section"
        aria-labelledby="policy-exception-heading"
        data-active={activeSection === "exceptions" || undefined}
      >
        <header className="policy-section__header">
          <div>
            <p className="section-index">03 · Ngoại lệ & hiệu lực</p>
            <h2 id="policy-exception-heading">Điều kiện tăng cấp duyệt</h2>
          </div>
          <button
            type="button"
            aria-expanded={activeSection === "exceptions"}
            onClick={() => setActiveSection("exceptions")}
          >
            {activeSection === "exceptions" ? "Đang chỉnh sửa ngoại lệ" : "Chỉnh sửa ngoại lệ"}
          </button>
        </header>
        {activeSection === "exceptions" ? (
          <div className="policy-section__body">
            <p className="policy-section-copy">Sản phẩm thiếu hàng khẩn cấp cần được ưu tiên xử lý.</p>
            <div className="policy-exception-list">
              {escalationOptions.map(({ value, label }) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    name="escalationFlags"
                    value={value}
                    checked={draft.escalationFlags.includes(value)}
                    onChange={(event) => toggleEscalation(value, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="policy-date-fields">
              <label className="field-group">
                <span>Hiệu lực từ</span>
                <input
                  ref={effectiveFromFieldRef}
                  name="effectiveFrom"
                  type="date"
                  value={draft.effectiveFrom}
                  aria-invalid={Boolean(errors.effectiveFrom)}
                  aria-describedby={errors.effectiveFrom ? "policy-effective-from-error" : undefined}
                  onChange={(event) => updateDraft("effectiveFrom", event.target.value)}
                />
                {errors.effectiveFrom ? <p className="field-error" id="policy-effective-from-error">{errors.effectiveFrom}</p> : null}
              </label>
              <label className="field-group">
                <span>Hiệu lực đến</span>
                <input
                  ref={effectiveToFieldRef}
                  name="effectiveTo"
                  type="date"
                  value={draft.effectiveTo ?? ""}
                  aria-invalid={Boolean(errors.effectiveTo)}
                  aria-describedby={errors.effectiveTo ? "policy-effective-to-error" : undefined}
                  onChange={(event) => updateDraft("effectiveTo", event.target.value || null)}
                />
                {errors.effectiveTo ? <p className="field-error" id="policy-effective-to-error">{errors.effectiveTo}</p> : null}
              </label>
            </div>
          </div>
        ) : (
          <p className="policy-section__collapsed">
            {isExceptionComplete ? `Hiệu lực từ ${draft.effectiveFrom}` : "Chưa chọn ngày hiệu lực"}
          </p>
        )}
      </section>

      <PolicySummary
        draft={draft}
        brands={brands}
        actions={(
          <>
            {saved ? <span role="status">Đã lưu chính sách mới.</span> : <span />}
            <button className="button button--primary" type="submit" disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu chính sách"}
            </button>
          </>
        )}
      />

      <aside className="policy-inflight-note">
        <strong>Không thay đổi hồ sơ đang duyệt</strong>
        <p>Mỗi hồ sơ giữ bản chụp chính sách tại thời điểm gửi. Cấu hình mới chỉ áp dụng cho lần gửi duyệt tiếp theo.</p>
      </aside>
    </form>
  );
}
