import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileUp, Save } from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/documents/RichTextEditor";
import WordImportDialog from "@/components/documents/WordImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocumentApi, fetchDocumentTypes, updateDocumentApi } from "@/lib/api";
import { APP_NAME } from "@/lib/branding";
import type { DocxImportResult } from "@/lib/docx-import";
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
  const [includeCompanySignature, setIncludeCompanySignature] = useState(
    Boolean(initialDocument?.includeCompanySignature),
  );
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [initializedFromType, setInitializedFromType] = useState(Boolean(initialDocument));
  const editorKeyRef = useRef(0);

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

  const handleImportConfirm = (
    result: DocxImportResult,
    options: { useSuggestedTitle: boolean },
  ) => {
    editorKeyRef.current += 1;
    setContentHtml(result.html);
    if (options.useSuggestedTitle && result.suggestedTitle) {
      setTitle(result.suggestedTitle);
    }
    toast.success("Word document imported — review the content before saving.");
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
        includeCompanySignature,
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
              Draft → HR {APP_NAME} approve → Select recipients → Send
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

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            checked={includeCompanySignature}
            onChange={(e) => setIncludeCompanySignature(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              Company / HR must also sign
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Leave unchecked for one-party documents (e.g. NDA signed only by the employee).
              Check only when the company signature is required on the document.
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Document content</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" />
              Import Word (.docx)
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Upload a Word file or write content. Insert signature fields and fillable fields
            (name + Text/Number/Date + width) inline where needed — match Signatory # with the
            send order. Only people you add as signatories receive the request.
          </p>
          <RichTextEditor
            key={editorKeyRef.current}
            value={contentHtml}
            onChange={setContentHtml}
          />
        </div>
      </div>

      <WordImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={handleImportConfirm}
        currentTitle={title}
      />
    </div>
  );
}
