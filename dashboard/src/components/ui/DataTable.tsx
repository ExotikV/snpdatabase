import type { ReactNode } from "react";
import { EmptyState, LoadingState } from "./Alert";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  headerClassName?: string;
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  rowClassName?: (row: T) => string | undefined;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingLabel,
  emptyTitle = "No results",
  emptyDescription,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted-bg/80">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted ${column.headerClassName ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4">
                <LoadingState label={loadingLabel} />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4">
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`transition-colors hover:bg-muted-bg/40 ${rowClassName?.(row) ?? ""}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-top text-foreground ${column.className ?? ""}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
