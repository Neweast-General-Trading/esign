import { useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  PenLine,
  Send,
  TableProperties,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import DocumentTrackingPanel from "@/components/documents/DocumentTrackingPanel";
import NeweastDocumentView from "@/components/documents/NeweastDocumentView";
import ElectronicSignatureDialog from "@/components/signature/ElectronicSignatureDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { deleteDocumentApi, hrSignDocumentApi } from "@/lib/api";
import { downloadNeweastPdf, openNeweastDocument } from "@/lib/neweast-document";
import { STATUS_LABELS, type SignDocument } from "@/lib/types";
import { statusTone } from "@/lib/status";
import { cn, formatDateTime } from "@/lib/utils";

interface DocumentViewPageProps {
  document: SignDocument;
  onUpdated: (doc: SignDocument) => void;
  onDeleted: () => void;
  onEdit: () => void;
  onConfigureSignatories: () => void;
}

type DetailTab = "overview" | "tracking" | "document";

function WorkflowCard({
  document,
  signedCount,
  userEmail,
}: {
  document: SignDocument;
  signedCount: number;
  userEmail?: string;
}) {
  return (
    <section className="app-surface rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-bold text-slate-900">Workflow</h3>
      </div>
      <ol className="space-y-2 text-xs text-slate-600">
        <li className={cn(document.status !== "draft" && "font-medium text-emerald-700")}>
          1. Upload / create document (uploader is not auto-signatory)
        </li>
        <li className={cn(document.recipients.length > 0 && "font-medium text-emerald-700")}>
          2. Configure signing steps (e.g. Employees → Manager)
        </li>
        <li className={cn(document.status !== "draft" && "font-medium text-emerald-700")}>
          3. Start signing — each employee gets a private copy
        </li>
        <li className={cn(signedCount > 0 && "font-medium text-emerald-700")}>
          4. After the employee signs, the manager is emailed that same copy
        </li>
        <li className={cn(document.status === "completed" && "font-medium text-emerald-700")}>
          5. Completed copy emailed to parties
        </li>
      </ol>
      <p className="mt-3 text-[11px] text-slate-400">Logged in as {userEmail}</p>
      {document.signingMode === "parallel" ? (
        <p className="mt-2 text-[11px] text-amber-700">This document used parallel (all-at-once) delivery.</p>
      ) : document.signingMode === "sequential" ? (
        <p className="mt-2 text-[11px] text-emerald-700">
          Step-based signing is active (next step waits for the current step).
        </p>
      ) : null}
    </section>
  );
}

export default function DocumentViewPage({
  document,
  onUpdated,
  onDeleted,
  onEdit,
  onConfigureSignatories,
}: DocumentViewPageProps) {
  const { user } = useAuth();
  const [hrSignOpen, setHrSignOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<DetailTab>(
    document.recipients.length > 0 ? "tracking" : "overview",
  );

  const signedCount = document.recipients.filter((r) => r.status === "signed").length;
  const canEdit = document.status === "draft";
  const canHrSign =
    document.status === "draft" && Boolean(document.includeCompanySignature);
  // Uploader may send without signing first — choose ordered signatories instead.
  const canSend =
    document.status === "draft" ||
    document.status === "hr_signed" ||
    document.status === "sent" ||
    document.status === "partially_signed";

  const progress = useMemo(() => {
    if (!document.recipients.length) return 0;
    return Math.round((signedCount / document.recipients.length) * 100);
  }, [document.recipients.length, signedCount]);

  const handleHrSign = async (signatureName: string) => {
    setSigning(true);
    try {
      const updated = await hrSignDocumentApi(document.id, signatureName);
      onUpdated(updated);
      setHrSignOpen(false);
      setTab("overview");
      toast.success("Optional company signature saved — configure who signs next");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign");
    } finally {
      setSigning(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${document.title}"? This cannot be undone.`)) return;
    try {
      await deleteDocumentApi(document.id);
      toast.success("Document deleted");
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      await downloadNeweastPdf(document);
      toast.success("NEWEAST PDF downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  const tabs: Array<{ id: DetailTab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: <FileText className="h-3.5 w-3.5" /> },
    {
      id: "tracking",
      label: `Tracking (${document.recipients.length})`,
      icon: <TableProperties className="h-3.5 w-3.5" />,
    },
    { id: "document", label: "Document", icon: <PenLine className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-5">
      <div
        className={cn(
          "grid gap-5",
          tab === "tracking"
            ? "grid-cols-1"
            : "xl:grid-cols-[minmax(0,1fr)_340px]",
        )}
      >
      <div className="min-w-0 space-y-4">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)]">
          <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#fff,#fef2f2_55%,#fff)] px-5 py-5 md:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-3xl tracking-tight text-slate-900">
                    {document.title}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                      statusTone(document.status),
                    )}
                  >
                    {STATUS_LABELS[document.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {document.documentType} · Created by {document.createdByName} ·{" "}
                  {formatDateTime(document.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting}
                  onClick={() => void handleDownload()}
                >
                  <Download className="h-4 w-4" />
                  {exporting ? "Exporting..." : "Download PDF"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void openNeweastDocument(document)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open
                </Button>
                {canEdit ? (
                  <Button variant="outline" size="sm" onClick={onEdit}>
                    Edit
                  </Button>
                ) : null}
                {canHrSign ? (
                  <Button size="sm" variant="outline" onClick={() => setHrSignOpen(true)}>
                    <PenLine className="h-4 w-4" />
                    Optional company sign
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => void handleDelete()}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>

            {document.recipients.length > 0 ? (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">Signature progress</span>
                  <span className="tabular-nums text-slate-500">
                    {signedCount}/{document.recipients.length} ({progress}%)
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    tab === item.id
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className={cn(tab === "tracking" ? "p-3 md:p-4" : "p-5")}>
            {tab === "overview" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Document
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Type</dt>
                      <dd className="font-medium text-slate-900">{document.documentType}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="font-medium text-slate-900">{STATUS_LABELS[document.status]}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Company signature</dt>
                      <dd className="font-medium text-slate-900">
                        {document.includeCompanySignature ? "Required" : "Not required (signatories only)"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Created</dt>
                      <dd className="font-medium text-slate-900">
                        {formatDateTime(document.createdAt)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Updated</dt>
                      <dd className="font-medium text-slate-900">
                        {formatDateTime(document.updatedAt)}
                      </dd>
                    </div>
                    {document.completedAt ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Completed</dt>
                        <dd className="font-medium text-slate-900">
                          {formatDateTime(document.completedAt)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Parties
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Prepared by</dt>
                      <dd className="text-right font-medium text-slate-900">
                        {document.createdByName}
                        <div className="text-xs font-normal text-slate-500">
                          {document.createdByEmail}
                        </div>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Company sign</dt>
                      <dd className="text-right font-medium text-slate-900">
                        {document.hrSignature?.name || "Skipped (optional)"}
                        {document.hrSignature?.signedAt ? (
                          <div className="text-xs font-normal text-slate-500">
                            {formatDateTime(document.hrSignature.signedAt)}
                          </div>
                        ) : null}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Signing mode</dt>
                      <dd className="font-medium capitalize text-slate-900">
                        {document.signingMode || "sequential"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Recipients</dt>
                      <dd className="font-medium text-slate-900">{document.recipients.length}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Signed</dt>
                      <dd className="font-medium text-emerald-700">
                        {signedCount}/{document.recipients.length || 0}
                      </dd>
                    </div>
                  </dl>
                </div>

                {document.notes ? (
                  <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Notes
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{document.notes}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "tracking" ? (
              <div className="-mx-1 md:-mx-2">
                <DocumentTrackingPanel document={document} onUpdated={onUpdated} />
              </div>
            ) : null}

            {tab === "document" ? <NeweastDocumentView document={document} /> : null}
          </div>
        </div>
      </div>

      {tab === "tracking" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {canSend ? (
            <section className="app-surface space-y-3 rounded-2xl p-5">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-red-700" />
                <h3 className="text-base font-bold text-slate-900">Who must sign?</h3>
              </div>
              <p className="text-sm text-slate-600">
                Open the dedicated page to define signing steps clearly — for example several
                employees in Step 1, then the manager in Step 2.
              </p>
              <Button type="button" onClick={onConfigureSignatories}>
                <Send className="h-4 w-4" />
                Configure signatories
              </Button>
            </section>
          ) : (
            <div />
          )}
          <WorkflowCard
            document={document}
            signedCount={signedCount}
            userEmail={user?.email}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {canSend ? (
            <section className="app-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-red-700" />
                  <h3 className="text-base font-bold text-slate-900">Who must sign?</h3>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Employees together in one step, then manager in the next — configured on a
                  separate page.
                </p>
              </div>
              <Button type="button" onClick={onConfigureSignatories}>
                <Send className="h-4 w-4" />
                Configure signatories
              </Button>
            </section>
          ) : null}
          <WorkflowCard
            document={document}
            signedCount={signedCount}
            userEmail={user?.email}
          />
        </div>
      )}
      </div>

      <ElectronicSignatureDialog
        open={hrSignOpen}
        defaultName={user?.name}
        title="Optional company signature"
        description="Only use this if the uploader should also sign as the company. For Offer Letters, skip this and put Head of HR first in the signing queue."
        confirmLabel="Approve & Sign"
        isSubmitting={signing}
        onClose={() => setHrSignOpen(false)}
        onConfirm={(name) => void handleHrSign(name)}
      />
    </div>
  );
}
