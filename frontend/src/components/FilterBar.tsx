import { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from './ui';

export function FilterBar({ children, search, onSearch, searchPlaceholder = 'Search...' }: {
  children?: ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
      {onSearch && (
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ''}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
      )}
      {children}
    </div>
  );
}
