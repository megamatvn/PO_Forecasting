import type { ImportIssue } from "@/features/imports/domain/import-types";

interface ImportIssueListProps {
  issues: ImportIssue[];
}
export function ImportIssueList({ issues }: ImportIssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="import-clean-state">
        <span aria-hidden="true">✓</span>
        <p>Không phát hiện lỗi hoặc cảnh báo.</p>
      </div>
    );
  }

  return (
    <ul className="import-issue-list" aria-label="Kết quả kiểm tra dữ liệu">
      {issues.map((issue, index) => (
        <li
          key={`${issue.rowNumber}-${issue.field}-${issue.code}-${index}`}
          className={`import-issue import-issue--${issue.severity}`}
        >
          <span className="status-badge">
            {issue.severity === "error" ? "Lỗi" : "Cảnh báo"}
          </span>
          <div>
            <strong>Dòng {issue.rowNumber}</strong>
            <p>{issue.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
