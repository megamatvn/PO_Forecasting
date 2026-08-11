"use client";

import { useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { PlanningRowView } from "@/features/planning/planning-types";

interface PlanningGridProps {
  rows: PlanningRowView[];
  canEdit: boolean;
  onRowChange(
    planLineId: string,
    changes: Partial<Pick<PlanningRowView, "qty" | "focQty" | "exPrice">>,
  ): void;
}

const columnHelper = createColumnHelper<PlanningRowView>();

function formatNumber(value: number, fractionDigits = 0) {
  return value.toLocaleString("vi-VN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function PlanningGrid({ rows, canEdit, onRowChange }: PlanningGridProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("sku", {
        id: "sku",
        header: "SKU",
        cell: (context) => <strong>{context.getValue()}</strong>,
      }),
      columnHelper.accessor("productName", {
        id: "productName",
        header: "Sản phẩm",
      }),
      columnHelper.accessor("openingStock", {
        header: "Tồn đầu",
        cell: (context) => formatNumber(context.getValue()),
      }),
      columnHelper.accessor("annualDemand", {
        header: "Forecast năm",
        cell: (context) => formatNumber(context.getValue()),
      }),
      columnHelper.accessor("qty", {
        header: "Qty",
        cell: (context) => (
          <input
            className="planning-grid__input"
            type="number"
            min="0"
            step="1"
            aria-label={`Qty ${context.row.original.sku}`}
            value={context.getValue()}
            disabled={!canEdit}
            onChange={(event) =>
              onRowChange(context.row.original.planLineId, {
                qty: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        ),
      }),
      columnHelper.accessor("focQty", {
        header: "FOC",
        cell: (context) => (
          <input
            className="planning-grid__input"
            type="number"
            min="0"
            step="1"
            aria-label={`FOC ${context.row.original.sku}`}
            value={context.getValue()}
            disabled={!canEdit}
            onChange={(event) =>
              onRowChange(context.row.original.planLineId, {
                focQty: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        ),
      }),
      columnHelper.accessor("exPrice", {
        header: "Ex Price",
        cell: (context) => (
          <input
            className="planning-grid__input planning-grid__input--price"
            type="number"
            min="0"
            step="0.000001"
            aria-label={`Ex Price ${context.row.original.sku}`}
            value={context.getValue()}
            disabled={!canEdit}
            onChange={(event) =>
              onRowChange(context.row.original.planLineId, {
                exPrice: event.target.value,
              })
            }
          />
        ),
      }),
      columnHelper.accessor("amount", {
        header: "Amount",
        cell: (context) => (
          <strong>{formatNumber(Number(context.getValue()), 2)}</strong>
        ),
      }),
      columnHelper.accessor("projectedStock", {
        header: "Tồn dự kiến",
        cell: (context) => formatNumber(context.getValue()),
      }),
      columnHelper.accessor("severity", {
        header: "Mức độ",
        cell: (context) => (
          <span
            className={`severity-label severity-label--${context.getValue()}`}
          >
            {context.getValue() === "critical"
              ? "Critical"
              : context.getValue() === "warning"
                ? "Warning"
                : "Healthy"}
          </span>
        ),
      }),
    ],
    [canEdit, onRowChange],
  );
  // TanStack Table intentionally exposes callable state; React Compiler skips it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className="planning-grid-section" aria-labelledby="planning-grid-title">
      <header>
        <div>
          <p className="section-index">Chi tiết kế hoạch</p>
          <h2 id="planning-grid-title">SKU và đề xuất mua</h2>
        </div>
        <p>{rows.length.toLocaleString("vi-VN")} SKU</p>
      </header>
      <div className="planning-grid-scroll">
        <table className="planning-grid">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`planning-column--${header.column.id}`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`planning-column--${cell.column.id}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
