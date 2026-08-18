"use client";

import { useState } from "react";
import { ImportDropzone } from "@/features/imports/components/import-dropzone";
import { ImportPreview } from "@/features/imports/components/import-preview";
import { SheetSelector } from "@/features/imports/components/sheet-selector";
import {
  httpImportTransport,
  useImportWorkflow,
  type ImportWorkflowTransport,
} from "@/features/imports/hooks/use-import-workflow";

interface ImportWorkflowProps {
  brandId: string;
  brandLabel?: string;
  transport?: ImportWorkflowTransport;
}

export function ImportWorkflow({
  brandId,
  brandLabel,
  transport = httpImportTransport,
}: ImportWorkflowProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const workflow = useImportWorkflow({ brandId, transport });
  const currentStep = workflow.result
    ? "confirm"
    : workflow.preview || workflow.state === "uploading" || workflow.sheetSelection
      ? "check"
      : "choose";
  const steps = [
    { id: "choose", label: "Chọn file" },
    { id: "check", label: "Kiểm tra" },
    { id: "confirm", label: "Xác nhận nhập dữ liệu" },
  ] as const;

  return (
    <div className="import-workflow">
      <ol className="import-steps" aria-label="Tiến trình nhập dữ liệu">
        {steps.map((step, index) => (
          <li
            key={step.id}
            aria-current={step.id === currentStep ? "step" : undefined}
          >
            <span aria-hidden="true">{index + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>
      <ImportDropzone
        fileName={fileName}
        disabled={workflow.state === "uploading"}
        onFileSelected={(file) => {
          setFileName(file.name);
          setSelectedFile(file);
          void workflow.selectFile(file).then((previewed) => {
            if (previewed) setSelectedFile(null);
          });
        }}
      />

      {workflow.state === "uploading" ? (
        <div className="import-progress" role="status">
          <span aria-hidden="true" />
          Đang đọc và kiểm tra file…
        </div>
      ) : null}

      {workflow.sheetSelection ? (
        <SheetSelector
          candidates={workflow.sheetSelection.candidates}
          fileName={fileName}
          disabled={workflow.state === "uploading"}
          onSelect={(candidate) => {
            if (selectedFile) {
              void workflow
                .selectFile(selectedFile, candidate.sheetName)
                .then((previewed) => {
                  if (previewed) setSelectedFile(null);
                });
            }
          }}
        />
      ) : null}

      {workflow.error ? (
        <div className="form-alert form-alert--error" role="alert">
          {workflow.error}
        </div>
      ) : null}

      {workflow.result ? (
        <section className="import-success" role="status">
          <p className="section-index">03 · Dữ liệu nguồn</p>
          <h2>Nhập dữ liệu hoàn tất</h2>
          <p>
            Bản dữ liệu nguồn được tạo lúc{" "}
            <strong>
              {new Intl.DateTimeFormat("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Ho_Chi_Minh",
              }).format(new Date(workflow.result.committedAt))}
            </strong>
          </p>
          <p>{workflow.result.affectedDraftCount} bản nháp bị ảnh hưởng</p>
        </section>
      ) : null}

      {workflow.preview && !workflow.result ? (
        <ImportPreview
          preview={workflow.preview}
          hasWarnings={workflow.hasWarnings}
          warningsConfirmed={workflow.warningsConfirmed}
          canCommit={workflow.canCommit}
          isCommitting={workflow.state === "committing"}
          fileName={fileName}
          brandLabel={brandLabel}
          onCommit={() => void workflow.commit()}
          onWarningsConfirmedChange={workflow.setWarningsConfirmed}
        />
      ) : null}
    </div>
  );
}
