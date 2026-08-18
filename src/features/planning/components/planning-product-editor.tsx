"use client";

import { useMemo, useState } from "react";
import { calculateAmount } from "@/lib/domain/money";
import type { PlanningRowView } from "@/features/planning/planning-types";

type EditableField = "qty" | "focQty" | "exPrice";

interface EditorDraft {
  qty: string;
  focQty: string;
  exPrice: string;
}

interface PlanningProductEditorProps {
  row: PlanningRowView | null;
  canEdit: boolean;
  currencyCode: string;
  onChange(
    planLineId: string,
    changes: Partial<Pick<PlanningRowView, "qty" | "focQty" | "exPrice">>,
  ): void;
  onApplyRecommendation?(row: PlanningRowView): void;
  onBack?(): void;
}

function draftFor(row: PlanningRowView): EditorDraft {
  return {
    qty: String(row.qty),
    focQty: String(row.focQty),
    exPrice: row.exPrice,
  };
}

function integerError(label: string, value: string) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? null
    : `${label} phải là số nguyên không âm.`;
}

function priceError(value: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) < 0) {
    return "Đơn giá xuất xưởng phải là số không âm.";
  }

  const fraction = value.split(".")[1];
  return fraction && fraction.length > 6
    ? "Đơn giá xuất xưởng chỉ được tối đa 6 chữ số thập phân."
    : null;
}

function formatQuantity(value: number) {
  return value.toLocaleString("vi-VN");
}

function displayInteger(raw: string, focused: boolean) {
  if (focused || !/^\d+$/.test(raw)) return raw;
  return Number(raw).toLocaleString("vi-VN");
}

export function PlanningProductEditor({
  row,
  canEdit,
  currencyCode,
  onChange,
  onApplyRecommendation,
  onBack,
}: PlanningProductEditorProps) {
  const [focusedField, setFocusedField] = useState<EditableField | null>(null);
  const [draftState, setDraftState] = useState<{
    planLineId: string | null;
    draft: EditorDraft | null;
  }>(() => ({
    planLineId: row?.planLineId ?? null,
    draft: row ? draftFor(row) : null,
  }));
  const draft =
    draftState.planLineId === row?.planLineId
      ? draftState.draft
      : row
        ? draftFor(row)
        : null;

  const errors = useMemo(
    () =>
      draft
        ? {
            qty: integerError("Số lượng đặt", draft.qty),
            focQty: integerError("Hàng tặng (FOC)", draft.focQty),
            exPrice: priceError(draft.exPrice),
          }
        : { qty: null, focQty: null, exPrice: null },
    [draft],
  );

  const amount = useMemo(() => {
    if (!draft || errors.qty || errors.exPrice) return "0.00";
    return calculateAmount({ qty: Number(draft.qty), exPrice: draft.exPrice });
  }, [draft, errors.exPrice, errors.qty]);

  if (!row || !draft) {
    return (
      <section className="planning-product-editor" aria-labelledby="planning-product-editor-title">
        <h2 id="planning-product-editor-title">Chi tiết sản phẩm</h2>
        <p className="muted-copy">Chọn một SKU để xem và chỉnh sửa đề xuất mua.</p>
      </section>
    );
  }

  const selectedRow = row;
  const selectedDraft = draft;

  function updateDraft(field: EditableField, value: string) {
    const nextDraft: EditorDraft = { ...selectedDraft, [field]: value };
    setDraftState({ planLineId: selectedRow.planLineId, draft: nextDraft });

    const error =
      field === "qty"
        ? integerError("Số lượng đặt", value)
        : field === "focQty"
          ? integerError("Hàng tặng (FOC)", value)
          : priceError(value);
    if (error) return;

    onChange(selectedRow.planLineId, {
      [field]: field === "exPrice" ? value : Number(value),
    });
  }

  function applyRecommendation() {
    setDraftState((current) => ({
      planLineId: selectedRow.planLineId,
      draft: current.planLineId === selectedRow.planLineId && current.draft
        ? { ...current.draft, qty: String(selectedRow.recommendedQty) }
        : { ...draftFor(selectedRow), qty: String(selectedRow.recommendedQty) },
    }));
    onApplyRecommendation?.(selectedRow);
  }

  const isValid = !errors.qty && !errors.focQty && !errors.exPrice;

  return (
    <section className="planning-product-editor" aria-labelledby="planning-product-editor-title">
      <header className="planning-product-editor__header">
        {onBack ? (
          <button className="button planning-product-editor__back" type="button" onClick={onBack}>
            Quay lại danh sách
          </button>
        ) : null}
        <p className="section-index">Chi tiết sản phẩm</p>
        <h2 id="planning-product-editor-title">{row.sku}</h2>
        <p>{row.productName}</p>
      </header>

      <dl className="planning-product-editor__context">
        <div><dt>Tồn hiện tại</dt><dd>{formatQuantity(row.openingStock)}</dd></div>
        <div><dt>Nhu cầu năm</dt><dd>{formatQuantity(row.annualDemand)}</dd></div>
        <div><dt>Thiếu dự kiến</dt><dd>{formatQuantity(row.recommendedQty)}</dd></div>
      </dl>

      <form
        className="planning-product-editor__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isValid) return;
          onChange(selectedRow.planLineId, {
            qty: Number(selectedDraft.qty),
            focQty: Number(selectedDraft.focQty),
            exPrice: selectedDraft.exPrice,
          });
        }}
      >
        <div className="planning-product-editor__fields">
          <div className="planning-product-editor__field">
            <label>
              <span>Số lượng đặt</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Số lượng đặt"
                value={displayInteger(draft.qty, focusedField === "qty")}
                disabled={!canEdit}
                aria-invalid={errors.qty ? "true" : undefined}
                aria-describedby={errors.qty ? "planning-qty-error" : undefined}
                onFocus={() => setFocusedField("qty")}
                onBlur={() => setFocusedField(null)}
                onChange={(event) => updateDraft("qty", event.target.value)}
              />
            </label>
            {errors.qty ? <p id="planning-qty-error" className="field-error">{errors.qty}</p> : null}
          </div>

          <div className="planning-product-editor__field">
            <label>
              <span>Hàng tặng (FOC)</span>
              <input
                type="text"
                inputMode="numeric"
                value={displayInteger(draft.focQty, focusedField === "focQty")}
                disabled={!canEdit}
                aria-invalid={errors.focQty ? "true" : undefined}
                aria-describedby={errors.focQty ? "planning-foc-error" : undefined}
                onFocus={() => setFocusedField("focQty")}
                onBlur={() => setFocusedField(null)}
                onChange={(event) => updateDraft("focQty", event.target.value)}
              />
            </label>
            {errors.focQty ? <p id="planning-foc-error" className="field-error">{errors.focQty}</p> : null}
          </div>

          <div className="planning-product-editor__field">
            <label>
              <span>Đơn giá xuất xưởng</span>
              <input
                type="text"
                inputMode="decimal"
                value={draft.exPrice}
                disabled={!canEdit}
                aria-invalid={errors.exPrice ? "true" : undefined}
                aria-describedby={errors.exPrice ? "planning-price-error" : undefined}
                onFocus={() => setFocusedField("exPrice")}
                onBlur={() => setFocusedField(null)}
                onChange={(event) => updateDraft("exPrice", event.target.value)}
              />
            </label>
            {errors.exPrice ? <p id="planning-price-error" className="field-error">{errors.exPrice}</p> : null}
          </div>

          <div className="planning-product-editor__field planning-product-editor__field--amount">
            <label>
              <span>Thành tiền</span>
              <input type="text" value={amount} readOnly aria-label="Thành tiền" />
              <small>{currencyCode} · tự tính theo Số lượng đặt × Đơn giá xuất xưởng</small>
            </label>
          </div>
        </div>

        {canEdit ? (
          <div className="planning-product-editor__actions">
            <button
              className="button"
              type="button"
              onClick={applyRecommendation}
              disabled={row.recommendedQty <= 0}
            >
              Điền đề xuất
            </button>
            <button className="button button--primary" type="submit" disabled={!isValid}>
              Lưu đề xuất
            </button>
          </div>
        ) : (
          <p className="muted-copy">Đang xem đề xuất đã lưu.</p>
        )}
      </form>
    </section>
  );
}
