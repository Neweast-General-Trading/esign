import { useMemo, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { DataTablePagination, DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Button } from "@/components/ui/button";
import { usePaginatedList } from "@/hooks/useTableControls";
import { STATUS_LABELS, type DocumentStatus, type SignDocument } from "@/lib/types";
import { statusTone } from "@/lib/status";
import { cn, formatDate } from "@/lib/utils";

interface DocumentsListPageProps {
  documents: SignDocument[];
  onBack: () => void;
  onOpen: (doc: SignDocument) => void;
}

const FILTERS: Array<{ id: "all" | DocumentStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "hr_signed", label: "HR Signed" },
  { id: "sent", label: "Sent" },
  { id: "partially_signed", label: "Partial" },
  { id: "completed", label: "Completed" },
];

export default function DocumentsListPage({ documents, onBack, onOpen }: DocumentsListPageProps) {
  const [filter, setFilter] = useState<"all" | DocumentStatus>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (filter !== "all" && doc.status !== filter) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.documentType.toLowerCase().includes(q) ||
        doc.createdByName.toLowerCase().includes(q) ||
        doc.recipients.some(
          (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
        )
      );
    });
  }, [documents, filter, query]);

  const { page, setPage, pageItems, totalPages, rangeLabel } = usePaginatedList(
    filtered,
    10,
    `${filter}|${query}`,
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">All Documents</h2>
          <p className="text-xs text-slate-500">{filtered.length} matching documents</p>
        </div>
      </div>

      <DataTableToolbar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search title, type, creator, recipient..."
        filters={FILTERS}
        activeFilter={filter}
        onFilterChange={(id) => setFilter(id as "all" | DocumentStatus)}
      />

      <div className="app-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Document</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Recipients</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No documents match this filter.
                  </td>
                </tr>
              ) : (
                pageItems.map((doc) => (
                  <tr
                    key={doc.id}
                    className="cursor-pointer border-b border-slate-100 transition hover:bg-red-50/40"
                    onClick={() => onOpen(doc)}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">{doc.title}</td>
                    <td className="px-4 py-3 text-slate-600">{doc.documentType}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                          statusTone(doc.status),
                        )}
                      >
                        {STATUS_LABELS[doc.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {doc.recipients.filter((r) => r.status === "signed").length}/
                        {doc.recipients.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(doc.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DataTablePagination
          page={page}
          totalPages={totalPages}
          rangeLabel={rangeLabel}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
