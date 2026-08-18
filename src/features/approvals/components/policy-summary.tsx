import type { BrandAccess } from "@/features/auth/access-types";
import type { ReactNode } from "react";
import {
  buildPolicySummary,
  type ApprovalPolicyDraft,
} from "@/features/approvals/domain/policy-summary";

interface PolicySummaryProps {
  draft: ApprovalPolicyDraft;
  brands: BrandAccess[];
  actions?: ReactNode;
}

export function PolicySummary({ draft, brands, actions }: PolicySummaryProps) {
  const summary = buildPolicySummary(draft, brands);

  return (
    <aside
      className="policy-summary"
      aria-labelledby="policy-summary-heading"
    >
      <p className="section-index">04 · Xác nhận</p>
      <h2 id="policy-summary-heading">Xác nhận</h2>
      <p className="policy-summary__copy">
        Kiểm tra cấu hình trước khi lưu chính sách mới.
      </p>
      <dl className="policy-summary__list">
        <div>
          <dt>Nhãn hàng áp dụng</dt>
          <dd data-incomplete={summary.brandLabels.length === 0 || undefined}>
            {summary.brandLabels.join(", ") || "Chưa chọn nhãn hàng"}
          </dd>
        </div>
        <div>
          <dt>Chế độ duyệt</dt>
          <dd>{summary.modeLabel}</dd>
        </div>
        <div>
          <dt>Cấp 1</dt>
          <dd>{summary.firstLevelLabel}</dd>
        </div>
        <div>
          <dt>Cấp 2</dt>
          <dd>{summary.secondLevelLabel}</dd>
        </div>
        {summary.thresholdLabel ? (
          <div>
            <dt>Hạn mức</dt>
            <dd>{summary.thresholdLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt>Ngoại lệ tăng cấp</dt>
          <dd>
            {summary.escalationLabels.join(", ") || "Không có ngoại lệ"}
          </dd>
        </div>
        <div>
          <dt>Ngày hiệu lực</dt>
          <dd data-incomplete={!summary.effectiveRangeLabel || undefined}>
            {summary.effectiveRangeLabel ?? "Chưa chọn ngày hiệu lực"}
          </dd>
        </div>
      </dl>
      <p className="policy-summary__note">
        Cấu hình mới không thay đổi hồ sơ đang duyệt.
      </p>
      {actions ? <footer className="policy-summary__actions">{actions}</footer> : null}
    </aside>
  );
}
