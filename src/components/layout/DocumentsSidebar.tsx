import { ChevronDown, ChevronRight, FileText, PenLine, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RecipientPublic, SignDocument } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { statusDot } from "@/lib/status";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  documents: SignDocument[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (doc: SignDocument) => void;
  onCreateNew: () => void;
}

function recipientDot(status: RecipientPublic["status"]) {
  if (status === "signed") return "bg-emerald-500";
  if (status === "declined") return "bg-red-400";
  return "bg-amber-400";
}

function recipientLabel(status: RecipientPublic["status"]) {
  if (status === "signed") return "Signed";
  if (status === "declined") return "Not this copy";
  return "Waiting";
}

function copyLabel(doc: SignDocument) {
  if (doc.counterpartName) return doc.counterpartName;
  return doc.title.replace(/\s+[—–-]\s+.*$/, "").trim() || doc.title;
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
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set());
  const [openCopies, setOpenCopies] = useState<Set<string>>(new Set());
  const [typesSeeded, setTypesSeeded] = useState(false);

  const tree = useMemo(() => {
    const splitParents = new Set(
      documents.map((doc) => doc.parentDocumentId).filter((id): id is string => Boolean(id)),
    );
    const visible = documents.filter(
      (doc) => !(doc.status === "cancelled" && splitParents.has(doc.id)),
    );

    const byType = new Map<string, SignDocument[]>();
    for (const doc of visible) {
      const type = doc.documentType?.trim() || "Other";
      const list = byType.get(type) || [];
      list.push(doc);
      byType.set(type, list);
    }

    return [...byType.entries()]
      .map(([type, copies]) => ({
        type,
        copies: [...copies].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
      }))
      .sort((a, b) => {
        const aTime = new Date(a.copies[0]?.updatedAt || 0).getTime();
        const bTime = new Date(b.copies[0]?.updatedAt || 0).getTime();
        return bTime - aTime;
      });
  }, [documents]);

  useEffect(() => {
    if (typesSeeded || tree.length === 0) return;
    setOpenTypes(new Set(tree.map((node) => node.type)));
    setTypesSeeded(true);
  }, [tree, typesSeeded]);

  useEffect(() => {
    if (!selectedId) return;
    const selected = documents.find((doc) => doc.id === selectedId);
    if (!selected) return;
    const type = selected.documentType?.trim() || "Other";
    setOpenTypes((prev) => {
      if (prev.has(type)) return prev;
      const next = new Set(prev);
      next.add(type);
      return next;
    });
    setOpenCopies((prev) => {
      if (prev.has(selected.id)) return prev;
      const next = new Set(prev);
      next.add(selected.id);
      return next;
    });
  }, [selectedId, documents]);

  const toggleType = (type: string) => {
    setOpenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleCopy = (id: string) => {
    setOpenCopies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
          "fixed inset-y-0 start-0 z-40 flex w-[320px] flex-col border-e border-slate-200 bg-white transition-transform md:static md:z-0",
          isOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-red-700" />
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

        <div className="flex-1 overflow-y-auto px-2 py-3">
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
            <div className="space-y-1">
              {tree.map(({ type, copies }) => {
                const typeOpen = openTypes.has(type);
                return (
                  <div key={type}>
                    <button
                      type="button"
                      onClick={() => toggleType(type)}
                      className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-2 text-left hover:bg-slate-50"
                    >
                      {typeOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-900">
                        {type}
                      </span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                        {copies.length}
                      </span>
                    </button>

                    {typeOpen ? (
                      <div className="ms-2 border-s border-slate-200 ps-1.5">
                        {copies.map((doc) => {
                          const copyOpen = openCopies.has(doc.id);
                          const people = [...doc.recipients].sort((a, b) => {
                            const stepA = a.signingStep || a.signingOrder || 99;
                            const stepB = b.signingStep || b.signingOrder || 99;
                            if (stepA !== stepB) return stepA - stepB;
                            return (a.signingOrder || 0) - (b.signingOrder || 0);
                          });
                          const signed = people.filter((r) => r.status === "signed").length;
                          return (
                            <div key={doc.id}>
                              <div
                                className={cn(
                                  "flex items-start gap-1 rounded-md pe-1",
                                  selectedId === doc.id ? "bg-red-50" : "hover:bg-slate-50",
                                )}
                              >
                                <button
                                  type="button"
                                  className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500"
                                  aria-label={copyOpen ? "Collapse copy" : "Expand copy"}
                                  onClick={() => toggleCopy(doc.id)}
                                >
                                  {copyOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onSelect(doc)}
                                  className="min-w-0 flex-1 py-1.5 text-left"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={cn(
                                        "h-1.5 w-1.5 shrink-0 rounded-full",
                                        statusDot(doc.status),
                                      )}
                                    />
                                    <span className="truncate text-[13px] font-medium text-slate-800">
                                      {copyLabel(doc)}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 truncate ps-3 text-[10px] text-slate-500">
                                    {STATUS_LABELS[doc.status]}
                                    {people.length
                                      ? ` · ${signed}/${people.length}`
                                      : " · not sent"}
                                  </div>
                                </button>
                              </div>

                              {copyOpen ? (
                                <div className="mb-1 ms-4 border-s border-slate-100 ps-2">
                                  {people.length === 0 ? (
                                    <p className="px-1 py-1 text-[11px] text-slate-400">
                                      Nobody has this copy yet
                                    </p>
                                  ) : (
                                    people.map((person) => (
                                      <button
                                        key={person.id}
                                        type="button"
                                        onClick={() => onSelect(doc)}
                                        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-slate-50"
                                      >
                                        <span
                                          className={cn(
                                            "h-1.5 w-1.5 shrink-0 rounded-full",
                                            recipientDot(person.status),
                                          )}
                                        />
                                        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">
                                          {person.name}
                                        </span>
                                        <span className="shrink-0 text-[10px] text-slate-400">
                                          {recipientLabel(person.status)}
                                        </span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
