import { FileText, PenLine, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SignDocument } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { statusDot } from "@/lib/status";
import { cn, formatDate } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  documents: SignDocument[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (doc: SignDocument) => void;
  onCreateNew: () => void;
}

export default function DocumentsSidebar({
  isOpen,
  onClose,
  documents,
  isLoading,
  selectedId,
  onSelect,
  onCreateNew,
}: SidebarProps) {
  return (
    <>
      {isOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/30 md:hidden"
          aria-label="Close sidebar"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex w-[300px] flex-col border-e border-slate-200 bg-white transition-transform md:static md:z-0",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-red-600" />
            <span className="text-sm font-semibold text-slate-900">Documents</span>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" onClick={onCreateNew} aria-label="New">
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="md:hidden"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <p className="px-2 py-4 text-xs text-slate-500">Loading...</p>
          ) : documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center">
              <PenLine className="mx-auto mb-2 h-5 w-5 text-slate-300" />
              <p className="text-xs text-slate-500">No documents yet</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onCreateNew}>
                Create first
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onSelect(doc)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition",
                    selectedId === doc.id
                      ? "border-red-300 bg-red-50/60"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", statusDot(doc.status))} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">{doc.title}</div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500">
                        {doc.documentType} · {STATUS_LABELS[doc.status]}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{formatDate(doc.updatedAt)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
