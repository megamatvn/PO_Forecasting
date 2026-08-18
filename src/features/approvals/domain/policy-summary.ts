import type { BrandAccess } from "@/features/auth/access-types";
import type { ApprovalMode } from "@/lib/domain/types";

export type ApprovalEscalationFlag =
  | "criticalShortage"
  | "budgetOverrun"
  | "newSupplier";

export interface ApprovalPolicyDraft {
  name: string;
  mode: ApprovalMode;
  thresholdAmount: string | null;
  currencyCode: string;
  brandIds: string[];
  escalationFlags: ApprovalEscalationFlag[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ApprovalPolicySummary {
  brandLabels: string[];
  modeLabel: string;
  firstLevelLabel: string;
  secondLevelLabel: string;
  thresholdLabel: string | null;
  escalationLabels: string[];
  effectiveRangeLabel: string | null;
}

const escalationLabels: Record<ApprovalEscalationFlag, string> = {
  criticalShortage: "Có sản phẩm thiếu hàng khẩn cấp",
  budgetOverrun: "Vượt ngân sách kế hoạch",
  newSupplier: "Có nhà cung cấp mới",
};

export function createApprovalPolicyDraft(): ApprovalPolicyDraft {
  return {
    name: "",
    mode: "fixed_two_level",
    thresholdAmount: null,
    currencyCode: "EUR",
    brandIds: [],
    escalationFlags: [],
    effectiveFrom: "",
    effectiveTo: null,
  };
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatThreshold(amount: string, currencyCode: string): string {
  return `${new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(Number(amount))} ${currencyCode}`;
}

export function buildPolicySummary(
  draft: ApprovalPolicyDraft,
  brands: readonly BrandAccess[],
): ApprovalPolicySummary {
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const brandLabels = draft.brandIds.flatMap((brandId) => {
    const brand = brandById.get(brandId);
    return brand ? [`${brand.code} · ${brand.name}`] : [];
  });
  const isThreshold = draft.mode === "threshold";
  const effectiveRangeLabel = draft.effectiveFrom
    ? draft.effectiveTo
      ? `${formatDate(draft.effectiveFrom)} – ${formatDate(draft.effectiveTo)}`
      : `Từ ${formatDate(draft.effectiveFrom)}`
    : null;

  return {
    brandLabels,
    modeLabel: isThreshold ? "Duyệt theo hạn mức" : "Duyệt 2 cấp bắt buộc",
    firstLevelLabel: "Quản lý nhãn hàng",
    secondLevelLabel: isThreshold
      ? "Ban điều hành khi đạt hạn mức"
      : "Ban điều hành",
    thresholdLabel:
      isThreshold && draft.thresholdAmount
        ? formatThreshold(draft.thresholdAmount, draft.currencyCode)
        : null,
    escalationLabels: draft.escalationFlags.map((flag) => escalationLabels[flag]),
    effectiveRangeLabel,
  };
}
