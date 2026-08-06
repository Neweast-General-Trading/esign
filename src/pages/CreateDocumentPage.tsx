import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/documents/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocumentApi, fetchDocumentTypes, updateDocumentApi } from "@/lib/api";
import type { SignDocument } from "@/lib/types";

interface CreateDocumentPageProps {
  initialDocument?: SignDocument | null;
  onCancel: () => void;
  onSaved: (doc: SignDocument) => void;
}

export default function CreateDocumentPage({
  initialDocument,
  onCancel,
  onSaved,
}: CreateDocumentPageProps) {
  const { data: documentTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: ["document-types", "active"],
    queryFn: () => fetchDocumentTypes(true),
  });

  const [title, setTitle] = useState(initialDocument?.title ?? "");
  const [documentType, setDocumentType] = useState(initialDocument?.documentType ?? "");
  const [notes, setNotes] = useState(initialDocument?.notes ?? "");
  const [contentHtml, setContentHtml] = useState(initialDocument?.contentHtml ?? "");
  const [saving, setSaving] = useState(false);
  const [initializedFromType, setInitializedFromType] = useState(Boolean(initialDocument));

  useEffect(() => {
    if (initialDocument || initializedFromType || documentTypes.length === 0) return;
    const first = documentTypes[0];
    setDocumentType(first.name);
    setTitle(first.defaultTitle || first.name);
    if (first.defaultContentHtml) setContentHtml(first.defaultContentHtml);
    setInitializedFromType(true);
  }, [documentTypes, initialDocument, initializedFromType]);

  const handleTypeChange = (name: string) => {
    setDocumentType(name);
    if (initialDocument) return;
    const selected = documentTypes.find((item) => item.name === name);
    if (!selected) return;
    if (selected.defaultTitle) setTitle(selected.defaultTitle);
    if (selected.defaultContentHtml) setContentHtml(selected.defaultContentHtml);
  };

  const handleSave = async () => {
    if (!title.trim() || !contentHtml.trim() || contentHtml === "<p></p>") {
      toast.error("Title and content are required");
      return;
    }
    if (!documentType.trim()) {
      toast.error("Document type is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        documentType,
        contentHtml,
        notes: notes.trim() || undefined,
      };
      const saved = initialDocument?.id
        ? await updateDocumentApi(initialDocument.id, payload)
        : await createDocumentApi(payload);
      toast.success(initialDocument ? "Document updated" : "Document created as draft");
      onSaved(saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </Button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {initialDocument ? "Edit Document" : "Create Document"}
            </h2>
            <p className="text-xs text-slate-500">
              Draft → HR e-sign approve → Select recipients → Send
            </p>
          </div>
        </div>
        <Button onClick={() => void handleSave()} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Draft"}
        </Button>
      </div>

      <div className="app-surface space-y-4 rounded-2xl p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Document title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Employee NDA 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-type">Document type</Label>
            <select
              id="doc-type"
              value={documentType}
              onChange={(e) => handleTypeChange(e.target.value)}
              disabled={typesLoading || documentTypes.length === 0}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-500/20"
            >
              {documentTypes.length === 0 ? (
                <option value="">No types configured</option>
              ) : (
                documentTypes.map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="doc-notes">Internal notes (optional)</Label>
          <Input
            id="doc-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Visible only to HR"
          />
        </div>

        <div className="space-y-2">
          <Label>Document content</Label>
          <RichTextEditor value={contentHtml} onChange={setContentHtml} />
        </div>
      </div>
    </div>
  );
}
