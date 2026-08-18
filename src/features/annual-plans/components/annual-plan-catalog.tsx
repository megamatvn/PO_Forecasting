"use client";

import Link from "next/link";
import { CreateRevisionButton } from "./create-revision-button";
import type { AnnualPlanCatalogDTO, AnnualPlanCatalogEntry } from "../server/load-annual-plan-catalog";

export type { AnnualPlanCatalogDTO } from "../server/load-annual-plan-catalog";

const statusLabels: Record<AnnualPlanCatalogEntry["status"], string> = {
  draft_owner_only: "Bản nháp riêng tư",
  pending_executive: "Chờ CEO/BOD phê duyệt",
  approved: "Đã phê duyệt",
  changes_requested: "Cần chỉnh sửa",
  rejected: "Đã từ chối",
  withdrawn: "Đã rút",
  superseded: "Đã thay thế",
};

function planHref(entry: AnnualPlanCatalogEntry, step: "scope" | "review" = "review"): string {
  const query = new URLSearchParams({ step, brandId: entry.brandId, planningYear: String(entry.planningYear) });
  return `/annual-plans/${entry.revisionId}?${query.toString()}`;
}

function EntryCard({ entry, action }: { entry: AnnualPlanCatalogEntry; action: React.ReactNode }) {
  return (
    <li className="annual-plan-catalog__item">
      <div className="annual-plan-catalog__item-main">
        <div>
          <p className="annual-plan-catalog__eyebrow">{entry.brandCode} · {entry.planningYear}</p>
          <h3>{entry.brandName}</h3>
          <p>Phiên bản {entry.revisionNumber} · Cập nhật {new Date(entry.updatedAt).toLocaleDateString("vi-VN")}</p>
        </div>
        <span className="status-badge status-badge--neutral">{statusLabels[entry.status]}</span>
      </div>
      <div className="annual-plan-catalog__item-actions">{action}</div>
    </li>
  );
}

function PlanSection({ title, description, entries, children }: { title: string; description: string; entries: AnnualPlanCatalogEntry[]; children: (entry: AnnualPlanCatalogEntry) => React.ReactNode }) {
  return (
    <section className="annual-plan-catalog__section" aria-labelledby={`annual-plan-catalog-${title}`}>
      <header>
        <div><p className="section-index">Kế hoạch năm</p><h2 id={`annual-plan-catalog-${title}`}>{title}</h2><p>{description}</p></div>
        <span className="status-badge status-badge--neutral">{entries.length}</span>
      </header>
      {entries.length ? <ul>{entries.map((entry) => <EntryCard key={entry.revisionId} entry={entry} action={children(entry)} />)}</ul> : <p className="annual-plan-catalog__empty">Chưa có hồ sơ trong nhóm này.</p>}
    </section>
  );
}

export function AnnualPlanCatalog({ catalog }: { catalog: AnnualPlanCatalogDTO }) {
  return (
    <div className="annual-plan-catalog">
      <section className="annual-plan-catalog__start" aria-labelledby="annual-plan-catalog-start-title">
        <div><p className="section-index">Tạo kế hoạch mới</p><h2 id="annual-plan-catalog-start-title">Chọn năm và nhãn hàng</h2><p>Bản nháp chỉ thuộc về người lập. Sau khi gửi, hồ sơ sẽ đi theo tuyến phê duyệt đã được cấu hình.</p></div>
        {catalog.canCreatePlan ? <form action="/annual-plans/new" method="get" className="annual-plan-catalog__start-form">
          <input type="hidden" name="step" value="scope" />
          <label><span>Nhãn hàng</span><select name="brandId" aria-label="Nhãn hàng kế hoạch mới" defaultValue={catalog.brands[0]?.id ?? ""}><option value="">Chọn nhãn hàng</option>{catalog.brands.filter((brand) => brand.isActive).map((brand) => <option key={brand.id} value={brand.id}>{brand.code} · {brand.name}</option>)}</select></label>
          <label><span>Năm kế hoạch</span><input name="planningYear" aria-label="Năm kế hoạch mới" type="number" min={catalog.currentYear} max={catalog.maxPlanningYear} defaultValue={catalog.currentYear} required /></label>
          <button className="button button--primary" type="submit">Tạo kế hoạch mới</button>
        </form> : <p className="annual-plan-catalog__empty">Tài khoản chưa được cấp quyền tạo kế hoạch.</p>}
      </section>

      <PlanSection title="Kế hoạch của tôi" description="Bản nháp và hồ sơ do bạn lập, không hiển thị nội dung cho người khác khi chưa gửi." entries={[...catalog.myDrafts, ...catalog.myPending]}>
        {(entry) => entry.status === "draft_owner_only"
          ? <Link className="button button--primary" href={planHref(entry, "scope")}>Tiếp tục bản nháp</Link>
          : <Link className="button" href={planHref(entry)}>Mở hồ sơ</Link>}
      </PlanSection>

      <PlanSection title="Kế hoạch đã phê duyệt" description="Phiên bản chuẩn đang có hiệu lực theo từng nhãn hàng và năm kế hoạch." entries={catalog.approvedBaselines}>
        {(entry) => <><Link className="button" href={planHref(entry)}>Xem kế hoạch</Link>{catalog.canCreatePlan ? <CreateRevisionButton revisionId={entry.revisionId} /> : null}</>}
      </PlanSection>

      {catalog.draftConflicts.length ? <section className="annual-plan-catalog__section annual-plan-catalog__conflicts" aria-labelledby="annual-plan-catalog-conflicts-title"><header><div><p className="section-index">Đang được chuẩn bị</p><h2 id="annual-plan-catalog-conflicts-title">Chu kỳ đang có bản nháp</h2><p>Hệ thống chỉ cho biết chu kỳ đã có người chuẩn bị; thông tin người lập và dữ liệu chi tiết được giữ riêng tư.</p></div></header><ul>{catalog.draftConflicts.map((conflict) => <li key={`${conflict.brandId}-${conflict.planningYear}`}><strong>{conflict.brandCode} · {conflict.brandName} · {conflict.planningYear}</strong><span>Đang có bản nháp riêng tư của người lập khác.</span></li>)}</ul></section> : null}

      <PlanSection title="Lịch sử phiên bản" description="Các phiên bản cũ được giữ để đối soát, không thay thế bản đang có hiệu lực." entries={catalog.revisionHistory}>
        {(entry) => <Link className="button" href={planHref(entry)}>Xem phiên bản {entry.revisionNumber}</Link>}
      </PlanSection>
    </div>
  );
}

export { statusLabels as annualPlanCatalogStatusLabels };
