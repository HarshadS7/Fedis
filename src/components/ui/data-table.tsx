import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface-card)] p-8 text-center text-sm text-[var(--ink-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface-card)]">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--gridline)]">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 font-normal text-[var(--ink-muted)] ${
                  column.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-[var(--gridline)] last:border-b-0"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 text-[var(--ink-primary)] ${
                    column.align === "right"
                      ? "text-right tabular-nums"
                      : "text-left"
                  }`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
