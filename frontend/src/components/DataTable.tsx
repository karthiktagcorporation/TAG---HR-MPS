import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';
import { EmptyState, LoadingState } from './States';
import type { PaginationMeta } from '@/types';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  rowKey?: (row: T, index: number) => string;
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading,
  meta,
  onPageChange,
  emptyTitle,
  emptyDescription,
  rowKey,
  rowClassName,
}: DataTableProps<T>) {
  if (loading) return <LoadingState />;
  if (!data.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  return (
    <div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground', alignClass(c.align))}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={rowKey ? rowKey(row, i) : row.id ?? i} className={cn('border-b border-border transition-colors hover:bg-muted/40', rowClassName?.(row))}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('whitespace-nowrap px-4 py-3', alignClass(c.align), c.className)}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && onPageChange && (
        <div className="flex flex-col items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm sm:flex-row">
          <span className="text-muted-foreground">
            Showing {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="px-2 text-muted-foreground">
              Page {meta.page} / {meta.totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
