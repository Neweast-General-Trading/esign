import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, ExternalLink, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import NeweastDocumentView from "@/components/documents/NeweastDocumentView";
import ElectronicSignatureDialog from "@/components/signature/ElectronicSignatureDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmSignApi, fetchSignRequest } from "@/lib/api";
import { APP_NAME } from "@/lib/branding";
import { downloadNeweastPdf, openNeweastDocument } from "@/lib/neweast-document";
import { parseInputFieldsFromHtml } from "@/lib/input-fields";
import { getRecipientStep } from "@/lib/recipient-step";
import { compactSignerOrdersInHtml } from "@/lib/signer-order";
import type { SignDocument } from "@/lib/types";
import { assetUrl } from "@/lib/utils";

interface SignPageProps {
  token: string;
}

export default function SignPage({ token }: SignPageProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sign-request", token],
    queryFn: () => fetchSignRequest(token),
  });

  const myFields = useMemo(() => {
    if (!data) return [];
    // Fields are assigned by signing STEP (Employees=1, Manager=2), not person index.
    const step = getRecipientStep(data.recipient);
    const html = compactSignerOrdersInHtml(data.document.contentHtml);
    return parseInputFieldsFromHtml(html).filter((field) => field.signerOrder === step);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const step = getRecipientStep(data.recipient);
    const html = compactSignerOrdersInHtml(data.document.contentHtml);
    const fields = parseInputFieldsFromHtml(html).filter((f) => f.signerOrder === step);
    const merged: Record<string, string> = {
      ...(data.recipient.fieldValues || {}),
    };
    for (const r of data.document.recipients || []) {
      for (const [key, value] of Object.entries(r.fieldValues || {})) {
        if (value?.trim() && !merged[key]) merged[key] = value.trim();
      }
    }
    const initial: Record<string, string> = {};
    for (const field of fields) {
      if (merged[field.fieldId]) initial[field.fieldId] = merged[field.fieldId]!;
    }
    setFieldValues((prev) => ({ ...initial, ...prev }));
  }, [data]);

  const confirmMutation = useMutation({
    mutationFn: (signatureName: string) =>
      confirmSignApi(token, signatureName, fieldValues),
    onSuccess: async () => {
      toast.success("Document signed successfully");
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["sign-request", token] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <img src={assetUrl("logo.png")} alt="NEWEAST" className="mx-auto h-14 w-auto" />
          <h1 className="mt-6 text-xl font-bold text-slate-900">Link unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error instanceof Error ? error.message : `This ${APP_NAME} link is invalid or expired.`}
          </p>
        </div>
      </div>
    );
  }

  const alreadySigned = data.recipient.status === "signed";
  const completed = data.document.status === "completed";

  const documentView: Pick<
    SignDocument,
    | "id"
    | "title"
    | "documentType"
    | "contentHtml"
    | "createdByName"
    | "createdAt"
    | "hrSignature"
    | "includeCompanySignature"
    | "recipients"
    | "completedAt"
    | "status"
  > = {
    id: data.document.id,
    title: data.document.title,
    documentType: data.document.documentType,
    contentHtml: compactSignerOrdersInHtml(data.document.contentHtml),
    createdByName: data.document.createdByName,
    createdAt: data.document.createdAt,
    hrSignature: data.document.hrSignature,
    includeCompanySignature: data.document.includeCompanySignature,
    completedAt: data.document.completedAt,
    status: data.document.status as SignDocument["status"],
    recipients:
      data.document.recipients?.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        status: r.status,
        signingOrder: r.signingOrder,
        signingStep: r.signingStep,
        stepLabel: r.stepLabel,
        signedAt: r.signedAt,
        signatureName: r.signatureName,
        fieldValues: r.fieldValues,
      })) ?? [
        {
          id: data.recipient.id,
          name: data.recipient.name,
          email: data.recipient.email,
          status: data.recipient.status,
          signingOrder: data.recipient.signingOrder,
          signingStep: data.recipient.signingStep,
          stepLabel: data.recipient.stepLabel,
          signedAt: data.recipient.signedAt,
          signatureName: data.recipient.signatureName,
          fieldValues: data.recipient.fieldValues,
        },
      ],
  };

  const openSignDialog = () => {
    const missing = myFields.filter(
      (field) => field.required && !(fieldValues[field.fieldId] || "").trim(),
    );
    if (missing.length) {
      toast.error(`Please fill: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setDialogOpen(true);
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      await downloadNeweastPdf(documentView);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster richColors position="top-right" />
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={assetUrl("logo.png")} alt="NEWEAST" className="h-9 w-auto" />
            <div>
              <div className="text-sm font-semibold text-slate-900">{APP_NAME}</div>
              <div className="text-xs text-slate-500">Signature portal</div>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium text-slate-900">{data.recipient.name}</div>
            <div className="text-xs text-slate-500">{data.recipient.email}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-red-700">Official NEWEAST Document</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{data.document.title}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Requested by {data.document.createdByName}
              </p>
            </div>
            {alreadySigned ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Signed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Action required
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleDownload()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Downloading..." : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={() => void openNeweastDocument(documentView)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </button>
          </div>
        </div>

        {!alreadySigned && myFields.length > 0 ? (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Required information</h2>
            <p className="text-xs text-slate-600">
              Complete these fields for your step, then sign. Values appear live on the document
              below.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {myFields.map((field) => (
                <div key={field.fieldId} className="space-y-1.5">
                  <Label htmlFor={field.fieldId}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Input
                    id={field.fieldId}
                    type={
                      field.fieldType === "date"
                        ? "date"
                        : field.fieldType === "number"
                          ? "number"
                          : "text"
                    }
                    inputMode={field.fieldType === "number" ? "decimal" : undefined}
                    value={fieldValues[field.fieldId] || ""}
                    onChange={(e) =>
                      setFieldValues((prev) => ({
                        ...prev,
                        [field.fieldId]: e.target.value,
                      }))
                    }
                    placeholder={field.label}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {alreadySigned && myFields.length > 0 ? (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Your submitted information</h2>
            <p className="text-xs text-emerald-800">
              Locked after signing — these values can no longer be changed.
            </p>
            <dl className="grid gap-2 sm:grid-cols-2">
              {myFields.map((field) => (
                <div key={field.fieldId} className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {field.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">
                    {fieldValues[field.fieldId] ||
                      data.recipient.fieldValues?.[field.fieldId] ||
                      "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <NeweastDocumentView document={documentView} draftFieldValues={fieldValues} />

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {alreadySigned ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Thank you — signature recorded</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {completed
                    ? "A signed copy has been emailed to you and the document owner."
                    : "Waiting for remaining signatories. You will receive the final copy once complete."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Ready to sign?</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Your signature will be placed on this document via {APP_NAME}.
                </p>
              </div>
              <Button onClick={openSignDialog}>
                <PenLine className="h-4 w-4" />
                Confirm &amp; Sign
              </Button>
            </div>
          )}
        </div>
      </main>

      <ElectronicSignatureDialog
        open={dialogOpen}
        defaultName={data.recipient.name}
        title={`Confirm ${APP_NAME}`}
        description="Review your name carefully. This signature will be permanently attached to the document."
        confirmLabel="Confirm Signature"
        isSubmitting={confirmMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onConfirm={(name) => confirmMutation.mutate(name)}
      />
    </div>
  );
}
