import type { ImportPreviewResponse } from "@/features/imports/hooks/use-import-workflow";
import { ImportIssueList } from "@/features/imports/components/import-issue-list";

interface ImportPreviewProps {
  preview: ImportPreviewResponse;
  hasWarnings: boolean;
  warningsConfirmed: boolean;
  canCommit: boolean;
  isCommitting: boolean;
  onCommit(): void;
  onWarningsConfirmedChange(value: boolean): void;
}

export function ImportPreview({
  preview,
  hasWarnings,
  warningsConfirmed,
  canCommit,
  isCommitting,
  onCommit,
  onWarningsConfirmedChange,
}: ImportPreviewProps) {
  const errorRows = new Set(
    preview.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.rowNumber),
  );
  const warningRows = new Set(
    preview.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.rowNumber),
  );
  const ignoredRows = preview.rows.filter((row) => errorRows.has(row.rowNumber));
  const changedRows = preview.rows.filter(
    (row) =>
      !errorRows.has(row.rowNumber) &&
      (row.rawSku !== row.canonicalSku || warningRows.has(row.rowNumber)),
  );
  const addedRows = preview.rows.filter(
    (row) =>
      !errorRows.has(row.rowNumber) &&
      row.rawSku === row.canonicalSku &&
      !warningRows.has(row.rowNumber),
  );

  const diffGroups = [
    {
      label: "Thêm mới",
      rows: addedRows,
      emptyCopy: "Không có SKU mới.",
    },
    {
      label: "Thay đổi",
      rows: changedRows,
      emptyCopy: "Không có SKU cần chuẩn hóa.",
    },
    {
      label: "Loại bỏ",
      rows: [],
      emptyCopy: "Không có dòng bị loại khỏi nguồn.",
    },
    {
      label: "Bỏ qua",
      rows: ignoredRows,
      emptyCopy: "Không có dòng lỗi bị bỏ qua.",
    },
  ] as const;

  return (
    <section className="import-preview" aria-labelledby="import-preview-title">
      <header className="import-preview__header">
        <div>
          <p className="section-index">02 · Đối soát</p>
          <h2 id="import-preview-title">Xem trước thay đổi</h2>
        </div>
        <span className="status-badge status-badge--neutral">
          {preview.rows.length} dòng hợp lệ
        </span>
      </header>

      <div className="import-diff-grid">
        {diffGroups.map((group) => (
          <section
            key={group.label}
            className="import-diff-card"
            aria-label={group.label}
          >
            <header>
              <span>{group.label}</span>
              <strong>{group.rows.length}</strong>
            </header>
            {group.rows.length > 0 ? (
              <ul>
                {group.rows.map((row) => (
                  <li key={`${group.label}-${row.rowNumber}-${row.rawSku}`}>
                    <strong>
                      {row.rawSku !== row.canonicalSku
                        ? `${row.rawSku} → ${row.canonicalSku}`
                        : row.canonicalSku}
                    </strong>
                    <span>{row.productName || `Dòng ${row.rowNumber}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{group.emptyCopy}</p>
            )}
          </section>
        ))}
      </div>

      <ImportIssueList issues={preview.issues} />

      {hasWarnings ? (
        <label className="import-warning-confirmation">
          <input
            type="checkbox"
            checked={warningsConfirmed}
            onChange={(event) =>
              onWarningsConfirmedChange(event.target.checked)
            }
          />
          <span>
            <strong>Tôi đã kiểm tra các cảnh báo</strong>
            <small>
              Amount sẽ luôn được hệ thống tính lại theo Qty × Ex Price.
            </small>
          </span>
        </label>
      ) : null}

      <div className="import-preview__actions">
        <p>Dữ liệu chỉ được ghi khi toàn bộ kiểm tra bắt buộc đạt yêu cầu.</p>
        <button
          className="button button--primary"
          type="button"
          disabled={!canCommit}
          onClick={onCommit}
        >
          {isCommitting ? "Đang hoàn tất…" : "Xác nhận import"}
        </button>
      </div>
    </section>
  );
}
