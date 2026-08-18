"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnnualPlanScopeStep, type AnnualPlanScopeValue } from "./annual-plan-scope-step";
import { AnnualPlanStepper } from "./annual-plan-stepper";
import type { BrandOptionDTO, ProductOptionDTO } from "@/features/master-data/contracts";
import { validateAnnualLinesStep, validatePurchaseWavesStep, validateScopeStep, type AnnualLineInput, type PurchaseWaveInput } from "../domain/validation";
import type { AnnualPlanReviewDTO, AnnualPlanStep } from "../server/load-annual-plan";
import { AnnualPlanReview } from "./annual-plan-review";
import { ExcelImportDialog } from "./excel-import-dialog";
import type { ExcelPreviewDTO } from "../excel/parser";
import { AnnualLinesStep } from "./annual-lines-step";
import type { AnnualLineRowModel } from "./annual-line-row";
import { PurchaseWaveStep, type PurchaseWaveLine } from "./purchase-wave-step";
import type { PurchaseWaveEditorModel } from "./purchase-wave-editor";

export interface AnnualPlanWizardProps {
  initialStep: AnnualPlanStep;
  revisionId?: string;
  lockVersion?: number;
  brands: BrandOptionDTO[];
  /** Optional explicit allow-list for callers that receive mixed brand data. */
  authorizedBrandIds?: string[];
  planningYears: number[];
  currentYear: number;
  initialScope: AnnualPlanScopeValue;
  allowedSteps?: AnnualPlanStep[];
  canCreateBrand?: boolean;
  onCreateBrand?: (input: { code: string; name: string }) => Promise<BrandOptionDTO>;
  onScopeChange?: (value: AnnualPlanScopeValue) => void;
  onContinue?: (value: AnnualPlanScopeValue) => void;
  onBack?: () => void;
  reviewData?: AnnualPlanReviewDTO;
  products?: ProductOptionDTO[];
  initialLines?: AnnualLineRowModel[];
  initialWaves?: PurchaseWaveEditorModel[];
}

export function AnnualPlanWizard({
  initialStep,
  revisionId,
  lockVersion = 0,
  brands: initialBrands,
  authorizedBrandIds,
  planningYears,
  currentYear,
  initialScope,
  allowedSteps = ["scope", "lines", "waves", "review"],
  canCreateBrand,
  onCreateBrand,
  onScopeChange,
  onContinue,
  onBack,
  reviewData,
  products: initialProducts = [],
  initialLines = [],
  initialWaves = [],
}: AnnualPlanWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<AnnualPlanStep>(allowedSteps.includes(initialStep) ? initialStep : (allowedSteps[0] ?? "scope"));
  const [scope, setScope] = useState(initialScope);
  const [brands, setBrands] = useState(initialBrands);
  const [products, setProducts] = useState(initialProducts);
  const [currentLockVersion, setCurrentLockVersion] = useState(lockVersion);
  const [lineRows, setLineRows] = useState<AnnualLineRowModel[]>(initialLines);
  const [waveRows, setWaveRows] = useState<PurchaseWaveEditorModel[]>(initialWaves);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [excelOpen, setExcelOpen] = useState(false);
  const [completion, setCompletion] = useState<"submitted" | "approved" | null>(null);
  const visibleBrands = useMemo(() => {
    const allow = authorizedBrandIds ? new Set(authorizedBrandIds) : null;
    return brands.filter((brand) => !allow || allow.has(brand.id));
  }, [authorizedBrandIds, brands]);
  const scopeValid = validateScopeStep({ ...scope, currentYear }).valid;
  const currentIndex = allowedSteps.indexOf(step);
  const nextStep = allowedSteps[currentIndex + 1];

  function updateScope(value: AnnualPlanScopeValue) {
    setScope(value);
    onScopeChange?.(value);
  }

  async function continueFromScope() {
    if (!scopeValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (onContinue) {
        onContinue(scope);
      } else if (revisionId) {
        const response = await fetch(`/api/v2/annual-plans/${revisionId}/scope`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedLockVersion: currentLockVersion, idempotencyKey: crypto.randomUUID() }),
        });
        const body = await response.json() as { data?: { lockVersion?: number }; error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? "Không thể lưu phạm vi kế hoạch.");
        if (typeof body.data?.lockVersion === "number") setCurrentLockVersion(body.data.lockVersion);
      } else {
        const response = await fetch("/api/v2/annual-plans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brandId: scope.brandId, planningYear: scope.planningYear, idempotencyKey: crypto.randomUUID() }),
        });
        const body = await response.json() as { data?: { revisionId?: string }; error?: { message?: string } };
        if (!response.ok || !body.data?.revisionId) throw new Error(body.error?.message ?? "Không thể tạo bản nháp.");
        router.push(`/annual-plans/${body.data.revisionId}?step=lines`);
        return;
      }
      if (nextStep) setStep(nextStep);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Không thể lưu bản nháp.");
    } finally {
      setSaving(false);
    }
  }

  async function createProduct(input: { brandId: string; sku: string; name: string }): Promise<ProductOptionDTO> {
    const response = await fetch("/api/v2/master-data/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, aliases: [], idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json() as { data?: ProductOptionDTO; error?: { message?: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Không thể tạo SKU.");
    setProducts((current) => [...current.filter((product) => product.id !== body.data?.id), body.data as ProductOptionDTO]);
    return body.data;
  }

  async function saveLines(input: { lockVersion: number; lines: AnnualLineRowModel[]; idempotencyKey: string }) {
    if (!revisionId) throw new Error("Bản nháp chưa có mã để lưu.");
    const response = await fetch(`/api/v2/annual-plans/${revisionId}/lines`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const body = await response.json() as { data?: { lockVersion?: number; lines?: AnnualLineRowModel[] }; error?: { message?: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Không thể lưu danh sách SKU.");
    const saved = { lockVersion: Number(body.data.lockVersion ?? input.lockVersion + 1), lines: body.data.lines ?? input.lines };
    setCurrentLockVersion(saved.lockVersion);
    setLineRows(saved.lines);
    return saved;
  }

  async function saveWaves(input: { lockVersion: number; waves: PurchaseWaveEditorModel[]; idempotencyKey: string }) {
    if (!revisionId) throw new Error("Bản nháp chưa có mã để lưu.");
    const response = await fetch(`/api/v2/annual-plans/${revisionId}/waves`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const body = await response.json() as { data?: { lockVersion?: number; waves?: PurchaseWaveEditorModel[] }; error?: { message?: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Không thể lưu phân bổ.");
    const saved = { lockVersion: Number(body.data.lockVersion ?? input.lockVersion + 1), waves: body.data.waves ?? input.waves };
    setCurrentLockVersion(saved.lockVersion);
    setWaveRows(saved.waves);
    return saved;
  }

  function continueStep() {
    if (step === "scope") { void continueFromScope(); return; }
    if (!revisionId || !nextStep) return;
    if (step === "lines") {
      const validation = validateAnnualLinesStep(lineRows);
      if (!validation.valid || lineRows.some((line) => !line.productId)) { setSaveError(validation.errors[0] ?? "Hãy lưu đầy đủ SKU trước khi tiếp tục."); return; }
    }
    if (step === "waves") {
      const lines: AnnualLineInput[] = lineRows.map((line) => ({ productId: line.productId, exPrice: line.exPrice, paidQty: line.paidQty, expectedFoc: line.expectedFoc, openingStock: line.openingStock }));
      const waves: PurchaseWaveInput[] = waveRows.map((wave) => ({ waveId: wave.id, waveNumber: wave.sequence, orderMonth: wave.orderMonth, arrivalMonth: wave.arrivalMonth, allocations: wave.allocations }));
      const validation = validatePurchaseWavesStep(lines, waves, scope.planningYear);
      if (!validation.valid) { setSaveError(validation.errors[0] ?? "Hãy lưu phân bổ khớp kế hoạch năm trước khi tiếp tục."); return; }
    }
    setSaveError(null);
    router.push(`/annual-plans/${revisionId}?step=${nextStep}`);
  }

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    const previousStep = allowedSteps[currentIndex - 1];
    if (!previousStep) return;
    router.push(revisionId ? `/annual-plans/${revisionId}?step=${previousStep}` : `/annual-plans/new?step=${previousStep}`);
  }

  async function createBrand(input: { code: string; name: string }) {
    const brand = onCreateBrand ? await onCreateBrand(input) : await (async () => {
      const response = await fetch("/api/v2/master-data/brands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json() as { data?: BrandOptionDTO; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Không thể tạo nhãn hàng.");
      return body.data;
    })();
    setBrands((current) => [...current.filter((item) => item.id !== brand.id), brand]);
    return brand;
  }

  async function submitReview() {
    if (!reviewData || !revisionId) return;
    const pendingDecision = reviewData.status === "pending_executive";
    const response = await fetch(`/api/v2/annual-plans/${revisionId}/${pendingDecision ? "decision" : "submit"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pendingDecision ? { decision: "approve", comment: "", idempotencyKey: crypto.randomUUID() } : { lockVersion, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await response.json() as { error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? "Không thể gửi kế hoạch.");
    setCompletion(pendingDecision || reviewData.role === "executive" ? "approved" : "submitted");
  }

  async function decideReview(decision: "request_changes" | "reject", comment: string) {
    if (!revisionId) return;
    const response = await fetch(`/api/v2/annual-plans/${revisionId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, comment, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await response.json() as { error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? "Không thể ghi nhận quyết định.");
    router.refresh();
  }

  async function previewExcel(file: File): Promise<ExcelPreviewDTO> {
    if (!revisionId) throw new Error("Hãy tạo bản nháp trước khi nhập Excel.");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch(`/api/v2/annual-plans/${revisionId}/excel-preview`, { method: "POST", body: formData });
    const body = await response.json() as { ok?: boolean; data?: ExcelPreviewDTO; error?: { message?: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Không thể xem trước file Excel.");
    return body.data;
  }

  async function applyExcel(input: { importSessionId: string; checksum: string; lockVersion: number; replaceSections: ["lines", "waves"]; idempotencyKey: string; payload: ExcelPreviewDTO }) {
    if (!revisionId) throw new Error("Hãy tạo bản nháp trước khi nhập Excel.");
    const response = await fetch(`/api/v2/annual-plans/${revisionId}/excel-apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const body = await response.json() as { ok?: boolean; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? "Không thể áp dụng file Excel.");
    router.refresh();
  }

  const annualLineProducts = useMemo(() => lineRows.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    return { productId: line.productId, canonicalSku: product?.canonicalSku ?? line.productId, productName: product?.name ?? "Sản phẩm", exPrice: line.exPrice, annualPaidQty: line.paidQty, annualFocQty: line.expectedFoc, openingStock: line.openingStock } satisfies PurchaseWaveLine;
  }), [products, lineRows]);

  return (
    <section className="annual-plan-wizard" aria-label="Tạo kế hoạch mua hàng">
      <AnnualPlanStepper revisionId={revisionId} currentStep={step} allowedSteps={allowedSteps} />
      {revisionId ? <div className="annual-plan-wizard__excel-actions" aria-label="Tùy chọn Excel"><a className="button" href={`/api/v2/annual-plans/${revisionId}/excel-template`}>Tải file mẫu</a><button type="button" className="button" onClick={() => setExcelOpen(true)}>Nhập từ Excel</button></div> : null}
      <div className="annual-plan-wizard__body">
        {completion ? <section className="annual-plan-completion" role="status" aria-labelledby="annual-plan-completion-title"><p className="section-index">Hoàn tất</p><h2 id="annual-plan-completion-title">{completion === "approved" ? "Kế hoạch đã được phê duyệt" : "Kế hoạch đã được gửi phê duyệt"}</h2><p>{completion === "approved" ? "Kế hoạch đã có hiệu lực và sẽ xuất hiện trong trang tổng quan." : "Hồ sơ đã được chuyển đến người phê duyệt được phân công. Bạn có thể theo dõi trạng thái trong danh mục kế hoạch."}</p><Link className="button button--primary" href="/annual-plans">Về danh mục kế hoạch</Link></section> : step === "scope" ? <AnnualPlanScopeStep value={scope} brands={visibleBrands} planningYears={planningYears} currentYear={currentYear} canCreateBrand={canCreateBrand} onChange={updateScope} onCreateBrand={createBrand} /> : step === "lines" && revisionId ? <AnnualLinesStep brandId={scope.brandId} products={products} initialLines={lineRows} lockVersion={currentLockVersion} revisionId={revisionId} onCreateProduct={canCreateBrand ? createProduct : undefined} onSave={saveLines} onChange={setLineRows} /> : step === "waves" && revisionId ? <PurchaseWaveStep planningYear={scope.planningYear} lines={annualLineProducts} initialWaves={waveRows} lockVersion={currentLockVersion} revisionId={revisionId} onSave={saveWaves} onChange={setWaveRows} /> : step === "review" && reviewData ? <AnnualPlanReview {...reviewData} onSubmit={submitReview} onRequestChanges={(comment) => decideReview("request_changes", comment)} onReject={(comment) => decideReview("reject", comment)} onSaveDraft={() => router.push("/annual-plans")} /> : (
          <section className="annual-plan-placeholder" aria-labelledby="annual-plan-next-step-title">
            <p className="section-index">Bước {currentIndex + 1}</p>
            <h2 id="annual-plan-next-step-title">{step === "lines" ? "Thêm SKU vào kế hoạch" : step === "waves" ? "Phân bổ theo đợt mua" : "Xem lại kế hoạch"}</h2>
            <p>Bước này sẽ mở sau khi phạm vi kế hoạch đã được lưu.</p>
          </section>
        )}
      </div>
      <footer className="annual-plan-wizard__footer">
        {completion ? <Link className="button" href="/annual-plans">Đóng</Link> : <><button type="button" className="button" onClick={goBack} disabled={currentIndex <= 0 || saving}>Quay lại</button><span className="annual-plan-wizard__save-state" role="status">{saveError ?? "Bản nháp chỉ hiển thị với chủ sở hữu"}</span>{nextStep ? <button type="button" className="button button--primary" onClick={continueStep} disabled={(step === "scope" && !scopeValid) || saving}>{saving ? "Đang lưu…" : "Tiếp tục"}</button> : step === "review" ? null : <button type="button" className="button button--primary" onClick={() => void submitReview()} disabled={saving || !reviewData}>{reviewData?.status === "pending_executive" ? "Xác nhận phê duyệt" : "Xác nhận & gửi duyệt"}</button>}</>}
      </footer>
      <ExcelImportDialog open={excelOpen} revisionId={revisionId ?? ""} lockVersion={currentLockVersion} onClose={() => setExcelOpen(false)} onPreview={previewExcel} onApply={applyExcel} />
    </section>
  );
}
