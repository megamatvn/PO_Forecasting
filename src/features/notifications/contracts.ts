import { z } from "zod";

export const notificationKinds = ["proposal_submitted", "proposal_approval_required", "proposal_approved", "proposal_changes_requested", "proposal_rejected", "proposal_over_plan", "annual_plan_approval_required"] as const;
export type NotificationKind = (typeof notificationKinds)[number];

export interface NotificationDTO {
  id: string;
  kind: NotificationKind | string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationReadSchema = z.object({ notificationId: z.string().uuid() });
