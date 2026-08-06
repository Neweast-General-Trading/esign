import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FilterChip {
  id: string;
  label: string;
}

interface DataTableToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterChip[];
  activeFilter?: string;
  onFilterChange?: (id: string) => void;
  rightSlot?: React.ReactNode;
}

export function DataTableToolbar({
  query,
  onQueryChange,
  searchPlaceholder = "Search...",
  filters,
  activeFilter = "all",
  onFilterChange,
  rightSlot,
}: DataTableToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {filters?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={activeFilter === item.id ? "default" : "outline"}
              onClick={() => onFilterChange?.(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      ) : (
        <div />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="ps-9"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
        {rightSlot}
      </div>
    </div>
  );
}

interface DataTablePaginationProps {
  page: number;
  totalPages: number;
  rangeLabel: string;
  onPageChange: (page: number) => void;
  className?: string;
}

export function DataTablePagination({
  page,
  totalPages,
  rangeLabel,
  onPageChange,
  className,
}: DataTablePaginationProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3",
        className,
      )}
    >
      <div className="text-xs font-medium text-slate-500">{rangeLabel}</div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="min-w-[4.5rem] text-center text-xs font-semibold text-slate-600">
          Page {page} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
