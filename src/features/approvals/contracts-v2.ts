export const approvalWorkKinds = [
  "annual_plan",
  "purchase_proposal",
  "proposal_cancellation",
] as const;

export type ApprovalWorkKind = (typeof approvalWorkKinds)[number];
export type ApprovalWorkLevel = "manager" | "executive";

export interface ApprovalWorkItem {
  id: string;
  kind: ApprovalWorkKind;
  targetId: string;
  href: string;
  title: string;
  submittedBy: string;
  submittedAt: string;
  brandCode: string;
  brandName: string;
  planningYear: number;
  currentLevel: ApprovalWorkLevel;
  assigneeId: string;
  overPlan: boolean;
  assignedPoLabel: string | null;
}

export const approvalWorkKindLabels: Record<ApprovalWorkKind, string> = {
  annual_plan: "Kế hoạch năm",
  purchase_proposal: "Đề xuất mua hàng",
  proposal_cancellation: "Yêu cầu hủy đề xuất",
};

export const approvalWorkLevelLabels: Record<ApprovalWorkLevel, string> = {
  manager: "Quản lý · Cấp 1",
  executive: "CEO/BOD · Cấp 2",
};
