import { describe, expect, it } from "vitest";
import {
  buildPolicySummary,
  createApprovalPolicyDraft,
  type ApprovalPolicyDraft,
} from "@/features/approvals/domain/policy-summary";

const brands = [
  {
    id: "brand-etx",
    code: "ETX",
    name: "Etiaxil",
  },
  {
    id: "brand-abc",
    code: "ABC",
    name: "A Better Company",
  },
];

describe("approval policy summary", () => {
  it("projects the default mandatory two-level draft for the selected brands", () => {
    const draft: ApprovalPolicyDraft = {
      ...createApprovalPolicyDraft(),
      name: "Chính sách ETX 2026",
      brandIds: ["brand-etx"],
      escalationFlags: ["criticalShortage"],
      effectiveFrom: "2026-01-01",
    };

    expect(buildPolicySummary(draft, brands)).toMatchObject({
      brandLabels: ["ETX · Etiaxil"],
      modeLabel: "Duyệt 2 cấp bắt buộc",
      firstLevelLabel: "Quản lý nhãn hàng",
      secondLevelLabel: "Ban điều hành",
      thresholdLabel: null,
      escalationLabels: ["Có sản phẩm thiếu hàng khẩn cấp"],
      effectiveRangeLabel: "Từ 01/01/2026",
    });
  });

  it("projects threshold, multiple brands, escalation flags and a finite effective range", () => {
    const draft: ApprovalPolicyDraft = {
      ...createApprovalPolicyDraft(),
      name: "Theo hạn mức 2027",
      mode: "threshold" as const,
      thresholdAmount: "50000",
      currencyCode: "EUR",
      brandIds: ["brand-etx", "brand-abc"],
      escalationFlags: ["criticalShortage", "budgetOverrun", "newSupplier"],
      effectiveFrom: "2027-01-01",
      effectiveTo: "2027-12-31",
    };

    expect(buildPolicySummary(draft, brands)).toMatchObject({
      brandLabels: ["ETX · Etiaxil", "ABC · A Better Company"],
      modeLabel: "Duyệt theo hạn mức",
      firstLevelLabel: "Quản lý nhãn hàng",
      secondLevelLabel: "Ban điều hành khi đạt hạn mức",
      thresholdLabel: "50.000 EUR",
      escalationLabels: [
        "Có sản phẩm thiếu hàng khẩn cấp",
        "Vượt ngân sách kế hoạch",
        "Có nhà cung cấp mới",
      ],
      effectiveRangeLabel: "01/01/2027 – 31/12/2027",
    });
  });
});
