"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface BrandOption { id: string; code: string; name: string }
interface ProductOption { id: string; canonicalSku: string; name: string }
interface ProposalLineDraft { productId: string; requestedQty: number | "" }
export interface ProposalFormValue { brandId: string; planningYear: number; neededMonth: string; reason: string; lines: Array<{ productId: string; requestedQty: number }> }

interface ProposalFormProps {
  brands: BrandOption[];
  products: ProductOption[];
  productsByBrand?: Record<string, ProductOption[]>;
  currentYear: number;
  onSubmit?: (value: ProposalFormValue) => Promise<void> | void;
}

function years(currentYear: number) { return [currentYear, currentYear + 1, currentYear + 2]; }

export function ProposalForm({ brands, products, productsByBrand, currentYear, onSubmit }: ProposalFormProps) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [planningYear, setPlanningYear] = useState(currentYear);
  const [neededMonth, setNeededMonth] = useState(`${currentYear}-01`);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<ProposalLineDraft[]>([{ productId: products[0]?.id ?? "", requestedQty: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const visibleProducts = useMemo(() => productsByBrand?.[brandId] ?? products, [brandId, products, productsByBrand]);

  function updateLine(index: number, patch: Partial<ProposalLineDraft>) { setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line)); }
  function addLine() { setLines((current) => [...current, { productId: visibleProducts[0]?.id ?? "", requestedQty: "" }]); }
  function removeLine(index: number) { setLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index)); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    if (!brandId || !neededMonth) { setError("Vui lòng chọn nhãn hàng và tháng cần hàng."); return; }
    if (reason.trim().length < 10) { setError("Vui lòng nhập lý do đủ rõ ràng."); return; }
    if (lines.some((line) => !line.productId || !Number.isInteger(line.requestedQty) || Number(line.requestedQty) <= 0)) { setError("Mỗi dòng SKU phải có số lượng nguyên dương."); return; }
    const value: ProposalFormValue = { brandId, planningYear, neededMonth, reason: reason.trim(), lines: lines.map((line) => ({ productId: line.productId, requestedQty: Number(line.requestedQty) })) };
    setSaving(true);
    try {
      if (onSubmit) { await onSubmit(value); return; }
      const createResponse = await fetch("/api/v2/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...value, idempotencyKey: crypto.randomUUID() }) });
      const createBody = await createResponse.json() as { data?: { proposalId?: string; lockVersion?: number }; error?: { message?: string } };
      if (!createResponse.ok || !createBody.data?.proposalId) throw new Error(createBody.error?.message ?? "Không thể tạo bản nháp đề xuất.");
      const proposalId = createBody.data.proposalId; const lockVersion = Number(createBody.data.lockVersion ?? 0);
      const saveResponse = await fetch(`/api/v2/proposals/${proposalId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lockVersion, lines: value.lines, idempotencyKey: crypto.randomUUID() }) });
      const saveBody = await saveResponse.json() as { data?: { lockVersion?: number }; error?: { message?: string } };
      if (!saveResponse.ok) throw new Error(saveBody.error?.message ?? "Không thể lưu các dòng đề xuất.");
      const submitResponse = await fetch(`/api/v2/proposals/${proposalId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lockVersion: Number(saveBody.data?.lockVersion ?? lockVersion + 1), idempotencyKey: crypto.randomUUID() }) });
      const submitBody = await submitResponse.json() as { error?: { message?: string } };
      if (!submitResponse.ok) throw new Error(submitBody.error?.message ?? "Không thể gửi đề xuất.");
      router.push(`/proposals/${proposalId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu đề xuất."); } finally { setSaving(false); }
  }

  return <form className="proposal-form" onSubmit={submit} noValidate>
    <div className="proposal-form__intro"><p className="section-index">01 · Nhu cầu mua</p><h2>Tạo đề xuất mua hàng</h2><p>Chọn SKU và số lượng cần bổ sung. Giá, FOC và công suất kế hoạch chỉ hiển thị cho người có quyền xem kế hoạch.</p></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="proposal-form__scope">
      <label>Nhãn hàng<select value={brandId} onChange={(event) => { const nextBrandId = event.target.value; setBrandId(nextBrandId); const nextProducts = productsByBrand?.[nextBrandId] ?? products; setLines([{ productId: nextProducts[0]?.id ?? "", requestedQty: "" }]); }}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.code} · {brand.name}</option>)}</select></label>
      <label>Năm kế hoạch<select value={planningYear} onChange={(event) => { const year = Number(event.target.value); setPlanningYear(year); setNeededMonth(`${year}-01`); }}>{years(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <label>Tháng cần hàng<input type="month" value={neededMonth} min={`${currentYear}-01`} onChange={(event) => setNeededMonth(event.target.value)} /></label>
    </div>
    <label>Lý do đề xuất<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Ví dụ: Bổ sung hàng cho chương trình bán tháng 3..." /></label>
    <div className="proposal-form__lines"><div className="proposal-form__lines-header"><div><p className="section-index">02 · Dòng hàng</p><h3>SKU cần bổ sung</h3></div><button className="button button--secondary" type="button" onClick={addLine}>Thêm SKU</button></div>
      {lines.map((line, index) => <div className="proposal-form__line" key={`${index}-${line.productId}`}>
        <label>SKU<select aria-label="SKU" value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })}>{visibleProducts.map((product) => <option key={product.id} value={product.id}>{product.canonicalSku} · {product.name}</option>)}</select></label>
        <label>Số lượng đề xuất<input aria-label="Số lượng đề xuất" type="number" min={1} step={1} value={line.requestedQty} onChange={(event) => updateLine(index, { requestedQty: event.target.value === "" ? "" : Number(event.target.value) })} /></label>
        <button className="button button--text" type="button" onClick={() => removeLine(index)} disabled={lines.length === 1}>Xoá dòng</button>
      </div>)}
    </div>
    <div className="proposal-form__footer"><p>Đề xuất nháp chỉ bạn nhìn thấy cho đến khi gửi.</p><button className="button" type="submit" disabled={saving}>{saving ? "Đang gửi..." : "Gửi đề xuất"}</button></div>
  </form>;
}
