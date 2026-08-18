"use client";

import { useState } from "react";
import { BrandModal } from "@/features/master-data/components/brand-modal";
import type { BrandOptionDTO } from "@/features/master-data/contracts";
import { validateScopeStep } from "../domain/validation";

export interface AnnualPlanScopeValue { brandId: string; planningYear: number }

export function AnnualPlanScopeStep({
  value,
  brands,
  planningYears,
  currentYear,
  canCreateBrand,
  onChange,
  onCreateBrand,
}: {
  value: AnnualPlanScopeValue;
  brands: BrandOptionDTO[];
  planningYears: number[];
  currentYear: number;
  canCreateBrand?: boolean;
  onChange: (value: AnnualPlanScopeValue) => void;
  onCreateBrand?: (input: { code: string; name: string }) => Promise<BrandOptionDTO>;
}) {
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = validateScopeStep({ brandId: value.brandId, planningYear: value.planningYear, currentYear });
  return (
    <section className="annual-plan-scope" aria-labelledby="annual-plan-scope-title">
      <div className="annual-plan-section-heading">
        <p className="section-index">Bước 1 · Phạm vi</p>
        <h2 id="annual-plan-scope-title">Chọn năm và nhãn hàng</h2>
        <p>Chọn kỳ kế hoạch bạn được cấp quyền. Chỉ năm hiện tại và năm tương lai mới có thể tạo mới.</p>
      </div>
      <div className="annual-plan-form-grid">
        <label>
          <span>Nhãn hàng</span>
          <select aria-label="Nhãn hàng" value={value.brandId} onChange={(event) => onChange({ ...value, brandId: event.target.value })}>
            <option value="">Chọn nhãn hàng</option>
            {brands.filter((brand) => brand.isActive).map((brand) => <option key={brand.id} value={brand.id}>{brand.code} · {brand.name}</option>)}
          </select>
        </label>
        <label>
          <span>Năm kế hoạch</span>
          <select aria-label="Năm kế hoạch" value={String(value.planningYear)} onChange={(event) => onChange({ ...value, planningYear: Number(event.target.value) })}>
            {planningYears.filter((year) => year >= currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>
      {canCreateBrand && onCreateBrand ? <button type="button" className="button annual-plan-scope__add-brand" onClick={() => setBrandModalOpen(true)}>Thêm nhãn hàng</button> : null}
      {!validation.valid ? <div className="form-alert" role="alert"><strong>Chưa thể tiếp tục</strong><ul>{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      {canCreateBrand && onCreateBrand ? <BrandModal open={brandModalOpen} onClose={() => setBrandModalOpen(false)} onCreated={(brand) => { onChange({ ...value, brandId: brand.id }); setBrandModalOpen(false); }} onCreate={async (input) => { try { const created = await onCreateBrand(input); setError(null); return created; } catch (reason) { const message = reason instanceof Error ? reason.message : "Không thể tạo nhãn hàng."; setError(message); throw reason; } }} /> : null}
    </section>
  );
}
