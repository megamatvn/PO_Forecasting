"use client";

import { useState } from "react";
import { ImportDropzone } from "@/features/imports/components/import-dropzone";
import { ImportPreview } from "@/features/imports/components/import-preview";
import {
  httpImportTransport,
  useImportWorkflow,
  type ImportWorkflowTransport,
} from "@/features/imports/hooks/use-import-workflow";

interface ImportWorkflowProps {
  brandId: string;
  transport?: ImportWorkflowTransport;
}

export function ImportWorkflow({
  brandId,
  transport = httpImportTransport,
}: ImportWorkflowProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const workflow = useImportWorkflow({ brandId, transport });

  return (
    <div className="import-workflow">
      <ImportDropzone
        fileName={fileName}
        disabled={workflow.state === "uploading"}
        onFileSelected={(file) => {
          setFileName(file.name);
          void workflow.selectFile(file);
        }}
      />

      {workflow.state === "uploading" ? (
        <div className="import-progress" role="status">
          <span aria-hidden="true" />
          Đang đọc và kiểm tra file…
        </div>
      ) : null}

      {workflow.error ? (
        <div className="form-alert form-alert--error" role="alert">
          {workflow.error}
        </div>
      ) : null}

      {workflow.result ? (
        <section className="import-success" role="status">
          <p className="section-index">03 · Snapshot nguồn</p>
          <h2>Import hoàn tất</h2>
          <p>
            Snapshot được tạo lúc{" "}
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
          <p>{workflow.result.affectedDraftCount} bản Draft bị ảnh hưởng</p>
        </section>
      ) : null}

      {workflow.preview && !workflow.result ? (
        <ImportPreview
          preview={workflow.preview}
          hasWarnings={workflow.hasWarnings}
          warningsConfirmed={workflow.warningsConfirmed}
          canCommit={workflow.canCommit}
          isCommitting={workflow.state === "committing"}
          onCommit={() => void workflow.commit()}
          onWarningsConfirmedChange={workflow.setWarningsConfirmed}
        />
      ) : null}
    </div>
  );
}
