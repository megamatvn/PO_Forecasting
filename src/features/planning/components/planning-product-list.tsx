"use client";

import { useMemo, useRef, useState } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  selectPlanningRows,
  type PlanningProductSeverity,
  type PlanningProductSort,
} from "@/features/planning/domain/product-list";
import type { PlanningRowView } from "@/features/planning/planning-types";

interface PlanningProductListProps {
  rows: readonly PlanningRowView[];
  selectedPlanLineId?: string | null;
  onSelect?(planLineId: string): void;
}

const sortLabels: Record<PlanningProductSort, string> = {
  shortage_desc: "Thiếu nhiều nhất",
  sku_asc: "SKU (A–Z)",
  product_name_asc: "Tên sản phẩm (A–Z)",
};

const severityLabels: Record<PlanningProductSeverity, string> = {
  all: "Tất cả trạng thái",
  critical: "Khẩn cấp",
  warning: "Cần chú ý",
  healthy: "Ổn định",
  unresolved: "Chưa xử lý",
};

function severityLabel(severity: PlanningRowView["severity"]) {
  return severityLabels[severity];
}

function formatNumber(value: number) {
  return value.toLocaleString("vi-VN");
}

export function PlanningProductList({
  rows,
  selectedPlanLineId,
  onSelect,
}: PlanningProductListProps) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<PlanningProductSeverity>("all");
  const [sort, setSort] = useState<PlanningProductSort>("shortage_desc");
  const [localSelectedPlanLineId, setLocalSelectedPlanLineId] = useState<
    string | null
  >(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const activePlanLineId = selectedPlanLineId ?? localSelectedPlanLineId;
  const visibleRows = useMemo(
    () => selectPlanningRows(rows, { query, severity, sort }),
    [query, rows, severity, sort],
  );
  const rovingPlanLineId = visibleRows.some(
    (row) => row.planLineId === activePlanLineId,
  )
    ? activePlanLineId
    : visibleRows[0]?.planLineId;

  function selectRow(planLineId: string) {
    setLocalSelectedPlanLineId(planLineId);
    onSelect?.(planLineId);
  }

  function selectRelativeRow(currentPlanLineId: string, offset: number) {
    const currentIndex = visibleRows.findIndex(
      (row) => row.planLineId === currentPlanLineId,
    );
    const nextRow = visibleRows[currentIndex + offset];
    if (!nextRow) return;

    selectRow(nextRow.planLineId);
    requestAnimationFrame(() => rowRefs.current.get(nextRow.planLineId)?.focus());
  }

  function handleRowKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement>,
    planLineId: string,
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectRelativeRow(planLineId, 1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectRelativeRow(planLineId, -1);
    }
    if (event.key === "Home" && visibleRows[0]) {
      event.preventDefault();
      selectRow(visibleRows[0].planLineId);
      requestAnimationFrame(() => rowRefs.current.get(visibleRows[0].planLineId)?.focus());
    }
    if (event.key === "End" && visibleRows.at(-1)) {
      event.preventDefault();
      const lastRow = visibleRows.at(-1);
      if (!lastRow) return;
      selectRow(lastRow.planLineId);
      requestAnimationFrame(() => rowRefs.current.get(lastRow.planLineId)?.focus());
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectRow(planLineId);
    }
  }

  return (
    <section className="planning-product-list" aria-labelledby="planning-product-list-title">
      <header className="planning-product-list__header">
        <div>
          <p className="section-index">Sản phẩm</p>
          <h2 id="planning-product-list-title">Danh sách SKU</h2>
        </div>
        <p className="planning-product-list__results" aria-live="polite">
          <span>Hiển thị {formatNumber(visibleRows.length)} trên {formatNumber(rows.length)} sản phẩm.</span>{" "}
          <span>Đang sắp xếp: {sortLabels[sort]}.</span>
        </p>
      </header>

      <div className="planning-product-list__toolbar">
        <label>
          <span>Tìm SKU hoặc tên sản phẩm</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ví dụ: ET-015025 hoặc Đặc trị xanh"
            aria-label="Tìm SKU hoặc tên sản phẩm"
          />
        </label>
        <label>
          <span>Lọc trạng thái</span>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as PlanningProductSeverity)}
            aria-label="Lọc trạng thái"
          >
            {(Object.keys(severityLabels) as PlanningProductSeverity[]).map((option) => (
              <option key={option} value={option}>
                {severityLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sắp xếp danh sách</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as PlanningProductSort)}
            aria-label="Sắp xếp danh sách"
          >
            {(Object.keys(sortLabels) as PlanningProductSort[]).map((option) => (
              <option key={option} value={option}>
                {sortLabels[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleRows.length === 0 ? (
        <p className="planning-product-list__empty" role="status">
          Không có sản phẩm phù hợp với bộ lọc hiện tại.
        </p>
      ) : (
        <div className="planning-product-list__table-wrap">
          <table aria-label="Danh sách sản phẩm">
            <colgroup>
              <col className="planning-product-list__col-sku" />
              <col className="planning-product-list__col-name" />
              <col className="planning-product-list__col-number" />
              <col className="planning-product-list__col-number" />
              <col className="planning-product-list__col-number" />
              <col className="planning-product-list__col-status" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" aria-sort={sort === "sku_asc" ? "ascending" : "none"}>
                  SKU
                </th>
                <th
                  scope="col"
                  aria-sort={sort === "product_name_asc" ? "ascending" : "none"}
                >
                  Sản phẩm
                </th>
                <th scope="col">Tồn hiện tại</th>
                <th scope="col">Nhu cầu năm</th>
                <th
                  scope="col"
                  aria-sort={sort === "shortage_desc" ? "descending" : "none"}
                >
                  Thiếu dự kiến
                </th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const isSelected = row.planLineId === activePlanLineId;
                return (
                  <tr
                    key={row.planLineId}
                    ref={(element) => {
                      if (element) rowRefs.current.set(row.planLineId, element);
                      else rowRefs.current.delete(row.planLineId);
                    }}
                    className={isSelected ? "is-selected" : undefined}
                    tabIndex={row.planLineId === rovingPlanLineId ? 0 : -1}
                    aria-current={isSelected ? "true" : undefined}
                    aria-selected={isSelected}
                    onClick={() => selectRow(row.planLineId)}
                    onKeyDown={(event) => handleRowKeyDown(event, row.planLineId)}
                  >
                    <td className="planning-product-list__sku"><strong>{row.sku}</strong></td>
                    <td className="planning-product-list__name">
                      <TruncatedText>{row.productName}</TruncatedText>
                    </td>
                    <td className="planning-product-list__number">{formatNumber(row.openingStock)}</td>
                    <td className="planning-product-list__number">{formatNumber(row.annualDemand)}</td>
                    <td className="planning-product-list__number">{formatNumber(row.recommendedQty)}</td>
                    <td className="planning-product-list__status">
                      <span className={`severity-label severity-label--${row.severity}`}>
                        {severityLabel(row.severity)}
                      </span>
                      {isSelected ? <span className="planning-product-list__current">Đang xem</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
