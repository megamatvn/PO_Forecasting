"use client";

import { useEffect, useRef, useState } from "react";

export interface PurchaseLineDraftChange {
  id: string;
  qty: number;
  focQty: number;
  exPrice: string;
}
export interface PurchaseProposalDraftChange {
  productId: string;
  qty: number;
  focQty: number;
  exPrice: string;
}

export interface DraftChangeSet {
  purchaseLines?: PurchaseLineDraftChange[];
  purchaseProposals?: PurchaseProposalDraftChange[];
}

export interface DraftSaveInput {
  planVersionId: string;
  expectedLockVersion: number;
  changes: DraftChangeSet;
  idempotencyKey: string;
}

export interface DraftSaveResult {
  lockVersion: number;
}

export type DraftSaver = (input: DraftSaveInput) => Promise<DraftSaveResult>;

interface ConflictDetails {
  remoteLockVersion: number | null;
  message: string;
}

export class PlanVersionConflictError extends Error {
  readonly details: ConflictDetails;

  constructor(details: ConflictDetails) {
    super(details.message);
    this.name = "PlanVersionConflictError";
    this.details = details;
  }
}

export const httpDraftSaver: DraftSaver = async (input) => {
  const response = await fetch(
    `/api/planning/${encodeURIComponent(input.planVersionId)}/draft`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = (await response.json()) as {
    code?: string;
    message?: string;
    lockVersion?: number;
    remoteLockVersion?: number;
  };

  if (response.status === 409 && body.code === "PLAN_VERSION_CONFLICT") {
    throw new PlanVersionConflictError({
      remoteLockVersion: body.remoteLockVersion ?? null,
      message:
        body.message ??
        "Kế hoạch đã được cập nhật ở một phiên làm việc khác.",
    });
  }

  if (!response.ok || body.lockVersion === undefined) {
    throw new Error(body.message || "Không thể lưu thay đổi kế hoạch.");
  }

  return { lockVersion: body.lockVersion };
};

function mergeByKey<T>(
  previous: readonly T[] = [],
  incoming: readonly T[] = [],
  keyOf: (item: T) => string,
): T[] {
  const merged = new Map(previous.map((item) => [keyOf(item), item]));
  for (const item of incoming) merged.set(keyOf(item), item);
  return [...merged.values()];
}

function mergeChanges(
  previous: DraftChangeSet,
  incoming: DraftChangeSet,
): DraftChangeSet {
  return {
    purchaseLines: mergeByKey(
      previous.purchaseLines,
      incoming.purchaseLines,
      (item) => item.id,
    ),
    purchaseProposals: mergeByKey(
      previous.purchaseProposals,
      incoming.purchaseProposals,
      (item) => item.productId,
    ),
  };
}

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

interface UseDraftAutosaveInput {
  planVersionId: string;
  initialLockVersion: number;
  save: DraftSaver;
  delayMs?: number;
}

export function useDraftAutosave({
  planVersionId,
  initialLockVersion,
  save,
  delayMs = 800,
}: UseDraftAutosaveInput) {
  const [status, setStatus] = useState<DraftSaveStatus>("idle");
  const [conflict, setConflict] = useState<ConflictDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lockVersionRef = useRef(initialLockVersion);
  const pendingRef = useRef<DraftChangeSet>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function queueSave(changes: DraftChangeSet) {
    pendingRef.current = mergeChanges(pendingRef.current, changes);
    setStatus("saving");
    setError(null);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      const pending = pendingRef.current;
      pendingRef.current = {};

      try {
        const result = await save({
          planVersionId,
          expectedLockVersion: lockVersionRef.current,
          changes: pending,
          idempotencyKey: crypto.randomUUID(),
        });
        lockVersionRef.current = result.lockVersion;
        setStatus("saved");
      } catch (saveError) {
        if (saveError instanceof PlanVersionConflictError) {
          setConflict(saveError.details);
          setStatus("conflict");
          return;
        }

        setError("Không thể lưu thay đổi. Dữ liệu local vẫn được giữ lại.");
        setStatus("error");
      }
    }, delayMs);
  }

  return {
    status,
    error,
    conflict,
    queueSave,
    dismissConflict: () => setConflict(null),
  };
}
