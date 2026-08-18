"use client";

import { useRef, useState } from "react";
import type {
  ForecastSheetCandidate,
  ImportIssue,
  ImportPreview,
} from "@/features/imports/domain/import-types";

export interface ImportPreviewResponse extends ImportPreview {
  batchId: string;
}

export interface ImportSheetSelectionRequiredError {
  code: "sheet_selection_required";
  message: string;
  candidates: ForecastSheetCandidate[];
  correlationId?: string;
}

export interface ImportCommitResponse {
  snapshotId: string;
  committedAt: string;
  affectedDraftCount: number;
}

export interface ImportWorkflowTransport {
  preview(
    file: File,
    brandId: string,
    sourceSheetName?: string,
  ): Promise<ImportPreviewResponse>;
  commit(input: {
    batchId: string;
    idempotencyKey: string;
    warningsConfirmed: boolean;
  }): Promise<ImportCommitResponse>;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { message?: string; code?: string } & T;

  if (!response.ok) {
    if (body.code === "sheet_selection_required") throw body;
    throw new Error(body.message || "Yêu cầu nhập dữ liệu không thành công.");
  }

  return body;
}

export const httpImportTransport: ImportWorkflowTransport = {
  async preview(file, brandId, sourceSheetName) {
    const formData = new FormData();
    formData.set("brandId", brandId);
    formData.set("file", file);
    if (sourceSheetName) formData.set("sourceSheetName", sourceSheetName);

    const response = await fetch("/api/imports/preview", {
      method: "POST",
      body: formData,
    });

    return readJsonResponse<ImportPreviewResponse>(response);
  },
  async commit(input) {
    const response = await fetch("/api/imports/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    return readJsonResponse<ImportCommitResponse>(response);
  },
};

export type ImportWorkflowState =
  | "idle"
  | "uploading"
  | "selecting_sheet"
  | "preview"
  | "committing"
  | "success"
  | "error";

interface UseImportWorkflowInput {
  brandId: string;
  transport: ImportWorkflowTransport;
}

export function useImportWorkflow({
  brandId,
  transport,
}: UseImportWorkflowInput) {
  const commitKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<ImportWorkflowState>("idle");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetSelection, setSheetSelection] = useState<ImportSheetSelectionRequiredError | null>(null);
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);

  const hasWarnings =
    preview?.issues.some((issue: ImportIssue) => issue.severity === "warning") ??
    false;
  const hasErrors =
    preview?.issues.some((issue: ImportIssue) => issue.severity === "error") ??
    false;

  async function selectFile(file: File, sourceSheetName?: string): Promise<boolean> {
    setState("uploading");
    setError(null);
    setSheetSelection(null);
    setPreview(null);
    setResult(null);
    setWarningsConfirmed(false);
    commitKeyRef.current = null;

    try {
      const result = await transport.preview(file, brandId, sourceSheetName);
      setPreview(result);
      setState("preview");
      return true;
    } catch (caught) {
      if (isSheetSelectionRequiredError(caught)) {
        setSheetSelection(caught);
        setState("selecting_sheet");
        return false;
      }
      setError("Không thể tạo bản xem trước. Vui lòng kiểm tra file và thử lại.");
      setState("error");
      return false;
    }
  }

  async function commit() {
    if (!preview) return;

    setState("committing");
    setError(null);

    try {
      commitKeyRef.current ??= crypto.randomUUID();
      const commitResult = await transport.commit({
        batchId: preview.batchId,
        idempotencyKey: commitKeyRef.current,
        warningsConfirmed,
      });
      setResult(commitResult);
      setState("success");
    } catch {
      setError("Không thể hoàn tất nhập dữ liệu. Bạn có thể thử lại an toàn.");
      setState("error");
    }
  }

  return {
    state,
    preview,
    result,
    error,
    sheetSelection,
    warningsConfirmed,
    setWarningsConfirmed,
    selectFile,
    commit,
    canCommit:
      (state === "preview" || state === "error") &&
      Boolean(preview?.canCommit) &&
      !hasErrors &&
      (!hasWarnings || warningsConfirmed),
    hasWarnings,
  };
}

function isSheetSelectionRequiredError(
  value: unknown,
): value is ImportSheetSelectionRequiredError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === "sheet_selection_required" &&
    "candidates" in value &&
    Array.isArray(value.candidates)
  );
}
