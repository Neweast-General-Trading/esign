import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTablePagination, DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePaginatedList } from "@/hooks/useTableControls";
import {
  createDocumentTypeApi,
  deleteDocumentTypeApi,
  fetchDocumentTypes,
  updateDocumentTypeApi,
} from "@/lib/api";
import type { DocumentTypeDefinition } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

interface DocumentTypesPageProps {
  onBack: () => void;
}

const emptyForm = {
  name: "",
  description: "",
  defaultTitle: "",
  defaultContentHtml: "",
  active: true,
};

type ActiveFilter = "all" | "active" | "inactive";

const FILTERS: Array<{ id: ActiveFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

export default function DocumentTypesPage({ onBack }: DocumentTypesPageProps) {
  const queryClient = useQueryClient();
  const { data: types = [], isLoading } = useQuery({
    queryKey: ["document-types"],
    queryFn: () => fetchDocumentTypes(false),
  });

  const [editing, setEditing] = useState<DocumentTypeDefinition | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...types]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((item) => {
        if (filter === "active" && !item.active) return false;
        if (filter === "inactive" && item.active) return false;
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          (item.description || "").toLowerCase().includes(q) ||
          (item.defaultTitle || "").toLowerCase().includes(q)
        );
      });
  }, [types, query, filter]);

  const { page, setPage, pageItems, totalPages, rangeLabel } = usePaginatedList(
    filtered,
    8,
    `${filter}|${query}`,
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      if (editing) {
        return updateDocumentTypeApi(editing.id, form);
      }
      return createDocumentTypeApi(form);
    },
    onSuccess: async () => {
      toast.success(editing ? "Document type updated" : "Document type created");
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["document-types"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocumentTypeApi(id),
    onSuccess: async () => {
      toast.success("Document type deleted");
      if (editing) {
        setEditing(null);
        setForm(emptyForm);
      }
      await queryClient.invalidateQueries({ queryKey: ["document-types"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startEdit = (item: DocumentTypeDefinition) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      defaultTitle: item.defaultTitle ?? "",
      defaultContentHtml: item.defaultContentHtml ?? "",
      active: item.active,
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Document Types</h2>
          <p className="text-xs text-slate-500">
            Define types used when creating E-Sign documents
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="app-surface overflow-hidden rounded-2xl">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">Configured types</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
            <DataTableToolbar
              query={query}
              onQueryChange={setQuery}
              searchPlaceholder="Search type name, description..."
              filters={FILTERS}
              activeFilter={filter}
              onFilterChange={(id) => setFilter(id as ActiveFilter)}
            />
          </div>

          {isLoading ? (
            <p className="px-4 py-8 text-xs text-slate-500">Loading...</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Description</th>
                      <th className="px-4 py-3 font-semibold">Default title</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                          No document types match this filter.
                        </td>
                      </tr>
                    ) : (
                      pageItems.map((item) => (
                        <tr
                          key={item.id}
                          className={cn(
                            "cursor-pointer border-t border-slate-100 transition hover:bg-red-50/30",
                            editing?.id === item.id && "bg-red-50/50",
                          )}
                          onClick={() => startEdit(item)}
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.description || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.defaultTitle || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                item.active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {item.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {formatDate(item.updatedAt)}
                          </td>
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
            </>
          )}
        </section>

        <section className="app-surface space-y-3 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-slate-900">
            {editing ? "Edit type" : "Create type"}
          </h3>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. NDA"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Short description"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default title</Label>
            <Input
              value={form.defaultTitle}
              onChange={(e) => setForm((prev) => ({ ...prev, defaultTitle: e.target.value }))}
              placeholder="Prefilled document title"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default content (HTML / text)</Label>
            <textarea
              value={form.defaultContentHtml}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, defaultContentHtml: e.target.value }))
              }
              rows={8}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-500/20"
              placeholder="Optional template content"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
            />
            Active
          </label>

          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            {editing ? (
              <Button
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${editing.name}"?`)) {
                    deleteMutation.mutate(editing.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
