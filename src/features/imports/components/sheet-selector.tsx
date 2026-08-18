import type { ForecastSheetCandidate } from "@/features/imports/domain/import-types";

interface SheetSelectorProps {
  candidates: readonly ForecastSheetCandidate[];
  fileName?: string | null;
  disabled?: boolean;
  onSelect(candidate: ForecastSheetCandidate): void;
}

const REQUIRED_SIGNAL_COUNT = 7;

export function SheetSelector({
  candidates,
  fileName,
  disabled = false,
  onSelect,
}: SheetSelectorProps) {
  return (
    <section
      className="import-sheet-selector"
      aria-labelledby="import-sheet-selector-title"
    >
      <header className="import-sheet-selector__header">
        <div>
          <p className="section-index">01A · Xác định nguồn</p>
          <h2 id="import-sheet-selector-title">Chọn trang tính kế hoạch</h2>
          <p className="muted-copy">
            File có nhiều trang tính phù hợp. Chọn đúng bảng kế hoạch để hệ thống
            tiếp tục kiểm tra; chưa có dữ liệu nào được ghi vào hệ thống.
          </p>
        </div>
        <span className="status-badge status-badge--warning">
          Đang chờ chọn trang tính
        </span>
      </header>

      {fileName ? (
        <p className="import-sheet-selector__file">
          File đang giữ trong bộ nhớ: <strong>{fileName}</strong>
        </p>
      ) : null}

      <div
        className="import-sheet-selector__choices"
        role="radiogroup"
        aria-labelledby="import-sheet-selector-title"
        aria-describedby="import-sheet-selector-help"
      >
        {candidates.map((candidate) => {
          const missing = candidate.missingHeaders.join(", ");
          return (
            <label
              className="import-sheet-selector__choice"
              key={`${candidate.sheetName}-${candidate.headerRow}`}
            >
              <input
                type="radio"
                name="import-source-sheet"
                value={candidate.sheetName}
                disabled={disabled}
                onChange={() => onSelect(candidate)}
              />
              <span className="import-sheet-selector__choice-copy">
                <strong>{candidate.sheetName}</strong>
                <small>{`Dòng tiêu đề ${candidate.headerRow} · Điểm nhận diện: ${candidate.score}/${REQUIRED_SIGNAL_COUNT}`}</small>
                {missing ? <small>Thiếu: {missing}</small> : null}
              </span>
            </label>
          );
        })}
      </div>

      <p id="import-sheet-selector-help" className="import-sheet-selector__help">
        Dùng Tab để di chuyển giữa các lựa chọn và Space để chọn. Hệ thống sẽ
        đọc lại chính file này với trang tính bạn chọn.
      </p>
    </section>
  );
}
