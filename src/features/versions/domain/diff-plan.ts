export type PlanDiffImpact =
  | "increase"
  | "decrease"
  | "changed"
  | "added"
  | "removed";

export interface PlanDiff {
  path: string;
  before: unknown;
  after: unknown;
  impact: PlanDiffImpact;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function impactFor(before: unknown, after: unknown): PlanDiffImpact {
  if (before === undefined) {
    return "added";
  }

  if (after === undefined) {
    return "removed";
  }

  if (typeof before === "number" && typeof after === "number") {
    if (after > before) {
      return "increase";
    }

    if (after < before) {
      return "decrease";
    }
  }

  return "changed";
}

function visit(
  before: unknown,
  after: unknown,
  path: string,
  result: PlanDiff[],
): void {
  if (Object.is(before, after)) {
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      visit(before[index], after[index], `${path}.${index}`, result);
    }
    return;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      visit(before[key], after[key], path ? `${path}.${key}` : key, result);
    }
    return;
  }

  result.push({
    path,
    before,
    after,
    impact: impactFor(before, after),
  });
}

export function diffPlan(before: unknown, after: unknown): PlanDiff[] {
  const result: PlanDiff[] = [];
  visit(before, after, "", result);
  return result;
}
