import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast, Toaster } from "sonner";
import NeweastDocumentView from "@/components/documents/NeweastDocumentView";
import ElectronicSignatureDialog from "@/components/signature/ElectronicSignatureDialog";
import { Button } from "@/components/ui/button";
import { confirmSignApi, fetchSignRequest } from "@/lib/api";
import type { SignDocument } from "@/lib/types";
import { assetUrl } from "@/lib/utils";

interface SignPageProps {
  token: string;
}

export default function SignPage({ token }: SignPageProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sign-request", token],
    queryFn: () => fetchSignRequest(token),
  });

  const confirmMutation = useMutation({
    mutationFn: (signatureName: string) => confirmSignApi(token, signatureName),
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <img src={assetUrl("logo.png")} alt="NEWEAST" className="mx-auto h-14 w-auto" />
          <h1 className="mt-6 text-xl font-bold text-slate-900">Link unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error instanceof Error ? error.message : "This e-sign link is invalid or expired."}
          </p>
        </div>
      </div>
    );
  }

  const alreadySigned = data.recipient.status === "signed";
  const completed = data.document.status === "completed";

  const documentView: Pick<
    SignDocument,
    | "title"
    | "documentType"
    | "contentHtml"
    | "createdByName"
    | "createdAt"
    | "hrSignature"
    | "recipients"
    | "completedAt"
    | "status"
  > = {
    title: data.document.title,
    documentType: data.document.documentType,
    contentHtml: data.document.contentHtml,
    createdByName: data.document.createdByName,
    createdAt: data.document.createdAt,
    hrSignature: data.document.hrSignature,
    completedAt: data.document.completedAt,
    status: data.document.status as SignDocument["status"],
    recipients: [
      {
        id: data.recipient.id,
        name: data.recipient.name,
        email: data.recipient.email,
        status: data.recipient.status,
        signedAt: data.recipient.signedAt,
        signatureName: data.recipient.signatureName,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
      <Toaster richColors position="top-right" />
      <header className="border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={assetUrl("logo.png")} alt="NEWEAST" className="h-10 w-auto" />
            <div>
              <div className="text-sm font-semibold text-slate-900">E-Sign</div>
              <div className="text-xs text-slate-500">Employee signature portal</div>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium text-slate-900">{data.recipient.name}</div>
            <div className="text-xs text-slate-500">{data.recipient.email}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-red-50/50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-red-600">Official NEWEAST Document</p>
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
        </div>

        <NeweastDocumentView document={documentView} />

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {alreadySigned ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Thank you — signature recorded</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {completed
                    ? "A signed copy has been emailed to you and HR."
                    : "Waiting for remaining recipients. You will receive the final signed copy by email once complete."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Ready to sign?</h2>
                <p className="mt-1 text-sm text-slate-600">
                  An electronic signature will be generated from your name and saved on this
                  document.
                </p>
              </div>
              <Button onClick={() => setDialogOpen(true)}>
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
        title="Confirm Electronic Signature"
        description="Review your name carefully. This signature will be permanently attached to the document."
        confirmLabel="Confirm Signature"
        isSubmitting={confirmMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onConfirm={(name) => confirmMutation.mutate(name)}
      />
    </div>
  );
}
