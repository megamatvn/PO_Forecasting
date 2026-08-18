import type { PlanDiff } from "@/features/versions/domain/diff-plan";

interface VersionDiffProps {
  fromLabel: string;
  toLabel: string;
  diffs: PlanDiff[];
}

const impactLabels = {
  increase: "Tăng",
  decrease: "Giảm",
  changed: "Thay đổi",
  added: "Thêm mới",
  removed: "Loại bỏ",
} as const;

function businessPath(path: string) {
  const parts = path.split(".");
  if (parts[0] === "purchaseLines" && parts.length >= 3) {
    const fieldLabels: Record<string, string> = {
      qty: "Qty",
      focQty: "Hàng tặng (FOC)",
      exPrice: "Đơn giá xuất xưởng",
      amount: "Amount",
    };
    return `${parts[1]} · ${fieldLabels[parts[2]] ?? parts[2]}`;
  }

  return path.replaceAll(".", " · ");
}

function formatValue(value: unknown) {
  if (value === undefined) return "—";
  if (value === null) return "Trống";
  if (typeof value === "number") return value.toLocaleString("vi-VN");
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function VersionDiff({ fromLabel, toLabel, diffs }: VersionDiffProps) {
  return (
    <section className="version-diff" aria-labelledby="version-diff-title">
      <header>
        <div>
          <p className="section-index">So sánh phiên bản</p>
          <h2 id="version-diff-title">
            {fromLabel} → {toLabel}
          </h2>
        </div>
        <span className="status-badge status-badge--neutral">
          {diffs.length.toLocaleString("vi-VN")} thay đổi
        </span>
      </header>
      {diffs.length === 0 ? (
        <div className="version-diff__empty">Hai phiên bản không có khác biệt.</div>
      ) : (
        <div className="version-diff__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hạng mục</th>
                <th>Trước</th>
                <th>Sau</th>
                <th>Tác động</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((diff) => (
                <tr key={diff.path}>
                  <th scope="row">{businessPath(diff.path)}</th>
                  <td colSpan={2} className="version-diff__change">
                    {formatValue(diff.before)} → {formatValue(diff.after)}
                  </td>
                  <td>
                    <span className={`diff-impact diff-impact--${diff.impact}`}>
                      {impactLabels[diff.impact]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
