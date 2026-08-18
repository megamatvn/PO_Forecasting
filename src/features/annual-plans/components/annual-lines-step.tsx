"use client";

import { useMemo, useState } from "react";
import { ProductModal } from "@/features/master-data/components/product-modal";
import type { BrandOptionDTO, ProductOptionDTO } from "@/features/master-data/contracts";
import { createIdempotencyKey } from "@/lib/idempotency";
import { validateAnnualLinesStep, type AnnualLineInput } from "../domain/validation";
import { AnnualLineRow, type AnnualLineRowModel } from "./annual-line-row";

function makeRow(index: number): AnnualLineRowModel { return { clientRowId: `row-${index}-${Math.random().toString(36).slice(2, 8)}`, productId: "", exPrice: "0", paidQty: 0, expectedFoc: 0, openingStock: 0 }; }

interface SaveResult { lockVersion: number; lines: AnnualLineRowModel[] }

export function AnnualLinesStep({ brandId, products: initialProducts, initialLines = [], lockVersion = 0, revisionId, onCreateProduct, onSave, onChange }: { brandId: string; products: ProductOptionDTO[]; initialLines?: AnnualLineRowModel[]; lockVersion?: number; revisionId?: string; onCreateProduct?: (input: { brandId: string; sku: string; name: string }) => Promise<ProductOptionDTO>; onSave?: (input: { lockVersion: number; lines: AnnualLineRowModel[]; idempotencyKey: string }) => Promise<SaveResult>; onChange?: (lines: AnnualLineRowModel[]) => void }) {
  const [products, setProducts] = useState(initialProducts);
  const [rows, setRows] = useState<AnnualLineRowModel[]>(initialLines.length ? initialLines : [makeRow(1)]);
  const [currentLockVersion, setCurrentLockVersion] = useState(lockVersion);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availableProducts = useMemo(() => products.filter((product) => product.brandId === brandId && product.isActive), [brandId, products]);
  const duplicateProductIds = useMemo(() => { const counts = new Map<string, number>(); for (const row of rows) if (row.productId) counts.set(row.productId, (counts.get(row.productId) ?? 0) + 1); return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id)); }, [rows]);
  const validation = validateAnnualLinesStep(rows as AnnualLineInput[]);

  function replaceRows(next: AnnualLineRowModel[]) { setRows(next); onChange?.(next); }
  function updateRow(index: number, patch: Partial<AnnualLineRowModel>) { replaceRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)); }
  function addRow() { replaceRows([...rows, makeRow(rows.length + 1)]); }
  function removeRow(index: number) { if (rows.length <= 1) return; replaceRows(rows.filter((_, rowIndex) => rowIndex !== index)); }

  async function save() {
    if (!validation.valid || rows.some((row) => !row.productId)) { setError("Chọn SKU và hoàn thiện các trường trước khi lưu."); return; }
    setSaving(true); setError(null);
    try {
      const payload = { lockVersion: currentLockVersion, lines: rows, idempotencyKey: createIdempotencyKey() };
      if (onSave) {
        const saved = await onSave(payload);
        setCurrentLockVersion(saved.lockVersion);
        if (saved.lines?.length) replaceRows(saved.lines);
      }
      else {
        if (!revisionId) throw new Error("Bản nháp chưa có mã để lưu.");
        const response = await fetch(`/api/v2/annual-plans/${revisionId}/lines`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const body = await response.json() as { data?: { lockVersion?: number; lines?: AnnualLineRowModel[] }; error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? "Không thể lưu danh sách SKU.");
        if (typeof body.data?.lockVersion === "number") setCurrentLockVersion(body.data.lockVersion);
        if (body.data?.lines?.length) replaceRows(body.data.lines);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu danh sách SKU.");
    } finally { setSaving(false); }
  }

  function createProduct(input: { brandId: string; sku: string; name: string }): Promise<ProductOptionDTO> {
    if (!onCreateProduct) return Promise.reject(new Error("Bạn chưa được cấp quyền tạo SKU."));
    return onCreateProduct(input);
  }

  function reconcileProduct(product: ProductOptionDTO) {
    setProducts((current) => [...current.filter((item) => item.id !== product.id), product]);
    const emptyIndex = rows.findIndex((row) => !row.productId);
    if (emptyIndex >= 0) updateRow(emptyIndex, { productId: product.id });
  }

  return (
    <section className="annual-lines-step" aria-labelledby="annual-lines-title">
      <header className="annual-lines-step__header"><div><p className="section-index">Bước 2 · Sản phẩm</p><h2 id="annual-lines-title">Danh sách SKU của kế hoạch</h2><p>Chỉ SKU thuộc nhãn hàng đang chọn được hiển thị. Nhập tồn đầu kỳ, Qty, FOC và Ex Price.</p></div><div className="annual-lines-step__actions"><button type="button" className="button" onClick={addRow}>Thêm SKU</button>{onCreateProduct ? <button type="button" className="button button--primary" onClick={() => setProductModalOpen(true)}>Thêm SKU mới</button> : null}</div></header>
      {duplicateProductIds.size ? <p className="form-alert" role="alert">SKU đã có trong kế hoạch. Mỗi SKU chỉ được nhập một lần.</p> : null}
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      <div className="annual-lines-step__table-wrap"><table className="annual-lines-table" aria-label="Danh sách SKU kế hoạch"><thead><tr><th scope="col">SKU & tên sản phẩm</th><th scope="col">Tồn đầu kỳ</th><th scope="col">Số lượng</th><th scope="col">FOC</th><th scope="col">Tổng nhận</th><th scope="col">Ex Price</th><th scope="col">Thành tiền</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{rows.map((row, index) => <AnnualLineRow key={row.clientRowId} index={index} row={row} products={availableProducts} onChange={(patch) => updateRow(index, patch)} onRemove={() => removeRow(index)} canRemove={rows.length > 1} />)}</tbody></table></div>
      <footer className="annual-lines-step__footer"><span>{rows.length} dòng · {duplicateProductIds.size ? "Cần xử lý SKU trùng" : validation.valid ? "Sẵn sàng lưu" : "Chưa đủ dữ liệu"}</span><button type="button" className="button button--primary" onClick={save} disabled={saving || !validation.valid || rows.some((row) => !row.productId)}>{saving ? "Đang lưu…" : "Lưu danh sách SKU"}</button></footer>
      {onCreateProduct ? <ProductModal open={productModalOpen} brands={[{ id: brandId, code: "", name: "Nhãn hàng đang chọn", isActive: true } satisfies BrandOptionDTO]} selectedBrandId={brandId} onClose={() => setProductModalOpen(false)} onCreated={(product) => { reconcileProduct(product); setProductModalOpen(false); }} onCreate={createProduct} /> : null}
    </section>
  );
}
