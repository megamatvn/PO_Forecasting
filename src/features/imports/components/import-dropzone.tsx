interface ImportDropzoneProps {
  disabled?: boolean;
  fileName?: string | null;
  onFileSelected(file: File): void;
}
export function ImportDropzone({
  disabled = false,
  fileName,
  onFileSelected,
}: ImportDropzoneProps) {
  return (
    <div className="import-dropzone">
      <div>
        <p className="section-index">01 · File nguồn</p>
        <h2>Chọn file kế hoạch để kiểm tra</h2>
        <p className="muted-copy">
          Hệ thống chỉ đọc file ở bước này. Dữ liệu chính chưa thay đổi cho đến
          khi bạn xác nhận import.
        </p>
      </div>
      <label className="button import-file-button" htmlFor="forecast-file">
        {fileName ? "Chọn file khác" : "Chọn file Excel"}
      </label>
      <input
        id="forecast-file"
        className="visually-hidden"
        type="file"
        accept=".xlsx,.xls"
        disabled={disabled}
        aria-label="Chọn file Excel"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />
      {fileName ? <p className="import-file-name">{fileName}</p> : null}
    </div>
  );
}
