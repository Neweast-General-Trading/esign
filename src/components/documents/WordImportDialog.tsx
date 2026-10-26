import { AlertTriangle, FileUp, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { convertDocxFileToHtml, type DocxImportResult } from "@/lib/docx-import";
import { cn } from "@/lib/utils";

interface WordImportDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: DocxImportResult, options: { useSuggestedTitle: boolean }) => void;
  currentTitle: string;
}

export default function WordImportDialog({
  open,
  onClose,
  onConfirm,
  currentTitle,
}: WordImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DocxImportResult | null>(null);
  const [applyTitle, setApplyTitle] = useState(false);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setError("");
      setResult(null);
      setApplyTitle(false);
    }
  }, [open]);

  const handlePickFile = () => {
    setError("");
    inputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const imported = await convertDocxFileToHtml(file);
      setResult(imported);
      setApplyTitle(!currentTitle.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import Word file");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    onConfirm(result, { useSuggestedTitle: applyTitle });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Close import dialog"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Import Word document</h3>
            <p className="mt-1 text-sm text-slate-600">
              Upload a <strong>.docx</strong> file. Review the preview, then apply the content to
              your draft.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />

          {!result ? (
            <button
              type="button"
              onClick={handlePickFile}
              disabled={loading}
              className={cn(
                "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
                loading
                  ? "border-slate-200 bg-slate-50"
                  : "border-slate-300 bg-slate-50/70 hover:border-red-300 hover:bg-red-50/40",
              )}
            >
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-red-600" />
              ) : (
                <FileUp className="h-8 w-8 text-red-600" />
              )}
              <span className="mt-3 text-sm font-semibold text-slate-800">
                {loading ? "Converting document..." : "Choose Word file (.docx)"}
              </span>
              <span className="mt-1 text-xs text-slate-500">Max 15 MB · tables and images supported</span>
            </button>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {result ? (
            <>
              {result.warnings.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Review recommended
                  </div>
                  <ul className="list-disc space-y-1 ps-5 text-xs leading-relaxed">
                    {result.warnings.slice(0, 6).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                  {result.warnings.length > 6 ? (
                    <p className="mt-2 text-xs text-amber-800">
                      + {result.warnings.length - 6} more conversion notes
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!currentTitle.trim() || result.suggestedTitle ? (
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={applyTitle}
                    onChange={(e) => setApplyTitle(e.target.checked)}
                  />
                  <span>
                    Use file name as document title
                    {result.suggestedTitle ? (
                      <>
                        : <strong>{result.suggestedTitle}</strong>
                      </>
                    ) : null}
                  </span>
                </label>
              ) : null}

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview
                  {result.hasArabic ? " · Arabic (RTL)" : ""}
                </div>
                <div className="max-h-[42vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
                  <div
                    className="doc-content text-[14px] leading-relaxed text-slate-800"
                    dangerouslySetInnerHTML={{ __html: result.html }}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {result ? (
            <Button type="button" onClick={handleConfirm}>
              Use imported content
            </Button>
          ) : (
            <Button type="button" onClick={handlePickFile} disabled={loading}>
              {loading ? "Converting..." : "Browse file"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
