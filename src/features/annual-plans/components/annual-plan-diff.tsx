export interface AnnualPlanDiffRow { label: string; before: string; after: string }

export function AnnualPlanDiff({ changes }: { changes: AnnualPlanDiffRow[] }) {
  if (!changes.length) return <p className="annual-plan-diff__empty">Không có thay đổi định lượng.</p>;
  return <div className="annual-plan-diff" role="region" aria-label="Chi tiết thay đổi"><table><thead><tr><th>Trường dữ liệu</th><th>Trước</th><th>Sau</th></tr></thead><tbody>{changes.map((change) => <tr key={`${change.label}-${change.before}-${change.after}`}><th scope="row">{change.label}</th><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div>;
}
