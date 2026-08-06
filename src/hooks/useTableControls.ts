import { useEffect, useMemo, useState } from "react";

/**
 * Shared list pagination. Pass resetKey (e.g. query+filter) to jump back to page 1.
 */
export function usePaginatedList<T>(
  items: T[],
  pageSize = 10,
  resetKey?: string | number,
) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const rangeLabel =
    items.length === 0
      ? "0 results"
      : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, items.length)} of ${items.length}`;

  return {
    page: safePage,
    setPage,
    pageSize,
    pageItems,
    total: items.length,
    totalPages,
    rangeLabel,
  };
}
