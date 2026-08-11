export type AppRole =
  | "administrator"
  | "planner"
  | "approver_l1"
  | "approver_l2"
  | "viewer";

export type AppAction =
  | "view"
  | "edit_plan"
  | "approve_l1"
  | "approve_l2"
  | "administer";

const actionRoles: Record<AppAction, readonly AppRole[]> = {
  view: ["planner", "approver_l1", "approver_l2", "viewer"],
  edit_plan: ["planner"],
  approve_l1: ["approver_l1"],
  approve_l2: ["approver_l2"],
  administer: [],
};

export function canPerform(
  roleSet: ReadonlySet<AppRole>,
  action: AppAction,
): boolean {
  if (roleSet.has("administrator")) {
    return true;
  }

  return actionRoles[action].some((role) => roleSet.has(role));
}
