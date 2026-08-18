"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type VersionHistoryStatus =
  | "draft"
  | "submitted"
  | "review_l1"
  | "review_l2"
  | "approved"
  | "changes_requested"
  | "superseded";

export interface VersionHistoryRow {
  id: string;
  cycleCode: string;
  cycleName: string;
  brandCode: string;
  brandName: string;
  planningYear: number;
  versionNumber: number;
  status: VersionHistoryStatus;
  createdAt: string;
}

interface VersionHistoryProps {
  versions: VersionHistoryRow[];
}

export const versionStatusLabels: Record<VersionHistoryStatus, string> = {
  draft: "Bản nháp",
  submitted: "Đã gửi duyệt",
  review_l1: "Chờ cấp 1",
  review_l2: "Chờ cấp 2",
  approved: "Đã duyệt",
  changes_requested: "Yêu cầu sửa",
  superseded: "Đã thay thế",
};

export function VersionHistory({ versions }: VersionHistoryProps) {
  const [brandFilter, setBrandFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<VersionHistoryStatus | "all">("all");
  const brands = useMemo(
    () => [...new Map(versions.map((version) => [version.brandCode, version.brandName])).entries()],
    [versions],
  );
  const years = useMemo(
    () => [...new Set(versions.map((version) => version.planningYear))].sort((a, b) => b - a),
    [versions],
  );
  const filteredVersions = useMemo(
    () =>
      versions.filter(
        (version) =>
          (brandFilter === "all" || version.brandCode === brandFilter) &&
          (yearFilter === "all" || String(version.planningYear) === yearFilter) &&
          (statusFilter === "all" || version.status === statusFilter),
      ),
    [brandFilter, statusFilter, versions, yearFilter],
  );

  return (
    <>
      <div className="version-filters" aria-label="Bộ lọc lịch sử phiên bản">
        <label>
          Nhãn hàng
          <select aria-label="Nhãn hàng" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
            <option value="all">Tất cả nhãn hàng</option>
            {brands.map(([code, name]) => (
              <option key={code} value={code}>{code} · {name}</option>
            ))}
          </select>
        </label>
        <label>
          Năm kế hoạch
          <select aria-label="Năm kế hoạch" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="all">Tất cả năm</option>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>
          Trạng thái
          <select aria-label="Trạng thái" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VersionHistoryStatus | "all")}>
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(versionStatusLabels).map(([status, label]) => (
              <option key={status} value={status}>{label}</option>
            ))}
          </select>
        </label>
        <span className="version-filters__count" role="status">
          {filteredVersions.length.toLocaleString("vi-VN")} phiên bản
        </span>
      </div>
      {filteredVersions.length === 0 ? (
        <section className="empty-state">
          <p className="section-index">Không có kết quả</p>
          <h2>Không có phiên bản phù hợp bộ lọc.</h2>
        </section>
      ) : (
        <div className="version-table-wrap">
          <table className="version-table">
            <thead>
              <tr>
                <th scope="col">Phiên bản</th>
                <th scope="col">Nhãn hàng và kế hoạch</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Ngày tạo</th>
                <th scope="col"><span className="visually-hidden">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredVersions.map((version) => (
                <tr key={version.id}>
                  <td data-label="Phiên bản">
                    <strong>Phiên bản {version.versionNumber}</strong>
                    <small>{version.cycleCode}</small>
                  </td>
                  <td data-label="Nhãn hàng và kế hoạch">
                    <strong>{version.brandCode} · {version.brandName}</strong>
                    <small>{version.cycleName} · {version.planningYear}</small>
                  </td>
                  <td data-label="Trạng thái">
                    <span className={`status-badge status-badge--${version.status}`}>
                      {versionStatusLabels[version.status]}
                    </span>
                  </td>
                  <td data-label="Ngày tạo">
                    <time dateTime={version.createdAt}>
                      {new Intl.DateTimeFormat("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        timeZone: "Asia/Ho_Chi_Minh",
                      }).format(new Date(version.createdAt))}
                    </time>
                  </td>
                  <td className="version-table__action">
                    <Link
                      className="button"
                      href={`/versions/${version.id}`}
                      aria-label={`Xem phiên bản ${version.versionNumber}`}
                    >
                      Xem
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
