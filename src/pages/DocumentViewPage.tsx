import { useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  PenLine,
  TableProperties,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import DocumentTrackingPanel from "@/components/documents/DocumentTrackingPanel";
import NeweastDocumentView from "@/components/documents/NeweastDocumentView";
import SendRecipientsPanel from "@/components/documents/SendRecipientsPanel";
import ElectronicSignatureDialog from "@/components/signature/ElectronicSignatureDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  deleteDocumentApi,
  hrSignDocumentApi,
  sendDocumentApi,
} from "@/lib/api";
import { downloadNeweastPdf, openNeweastDocument } from "@/lib/neweast-document";
import { STATUS_LABELS, type SignDocument } from "@/lib/types";
import { statusTone } from "@/lib/status";
import { cn, formatDateTime } from "@/lib/utils";

interface DocumentViewPageProps {
  document: SignDocument;
  onUpdated: (doc: SignDocument) => void;
  onDeleted: () => void;
  onEdit: () => void;
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
          1. HR creates &amp; reviews document
        </li>
        <li className={cn(document.hrSignature && "font-medium text-emerald-700")}>
          2. HR approves with electronic signature
        </li>
        <li className={cn(document.recipients.length > 0 && "font-medium text-emerald-700")}>
          3. Choose employees + customize email
        </li>
        <li className={cn(signedCount > 0 && "font-medium text-emerald-700")}>
          4. Employee confirms e-signature
        </li>
        <li className={cn(document.status === "completed" && "font-medium text-emerald-700")}>
          5. Signed copy emailed to both parties
        </li>
      </ol>
      <p className="mt-3 text-[11px] text-slate-400">Logged in as {userEmail}</p>
    </section>
  );
}

export default function DocumentViewPage({
  document,
  onUpdated,
  onDeleted,
  onEdit,
}: DocumentViewPageProps) {
  const { user } = useAuth();
  const [hrSignOpen, setHrSignOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<DetailTab>(
    document.recipients.length > 0 ? "tracking" : "overview",
  );

  const signedCount = document.recipients.filter((r) => r.status === "signed").length;
  const canEdit = document.status === "draft";
  const canHrSign = document.status === "draft";
  const canSend =
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
      toast.success("HR electronic signature applied — choose recipients to send");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign");
    } finally {
      setSigning(false);
    }
  };

  const handleSend = async (payload: {
    mode: "all" | "selected" | "department" | "company";
    recipients: Array<{ name: string; email: string }>;
    departmentCodes: number[];
    companyCodes: string[];
    emailSubject: string;
    emailBody: string;
  }) => {
    if (payload.mode === "selected" && !payload.recipients.length) {
      toast.error("Select at least one employee");
      return;
    }
    if (payload.mode === "department" && !payload.departmentCodes.length) {
      toast.error("Select at least one department");
      return;
    }
    if (payload.mode === "company" && !payload.companyCodes.length) {
      toast.error("Select at least one company");
      return;
    }

    setSending(true);
    try {
      const updated = await sendDocumentApi(document.id, payload);
      onUpdated(updated);
      setTab("tracking");
      if (updated.mailError) {
        toast.warning(
          `Prepared for ${updated.recipients.length} employee(s), but email delivery failed.`,
          { description: updated.mailError, duration: 12000 },
        );
      } else {
        toast.success(`Sent to ${updated.recipients.length} employee(s)`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send");
    } finally {
      setSending(false);
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
                <Button variant="outline" size="sm" onClick={() => openNeweastDocument(document)}>
                  <ExternalLink className="h-4 w-4" />
                  Open
                </Button>
                {canEdit ? (
                  <Button variant="outline" size="sm" onClick={onEdit}>
                    Edit
                  </Button>
                ) : null}
                {canHrSign ? (
                  <Button size="sm" onClick={() => setHrSignOpen(true)}>
                    <PenLine className="h-4 w-4" />
                    Approve &amp; Sign
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
                      <dt className="text-slate-500">Created by</dt>
                      <dd className="text-right font-medium text-slate-900">
                        {document.createdByName}
                        <div className="text-xs font-normal text-slate-500">
                          {document.createdByEmail}
                        </div>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">HR signature</dt>
                      <dd className="text-right font-medium text-slate-900">
                        {document.hrSignature?.name || "Not signed yet"}
                        {document.hrSignature?.signedAt ? (
                          <div className="text-xs font-normal text-slate-500">
                            {formatDateTime(document.hrSignature.signedAt)}
                          </div>
                        ) : null}
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
            <SendRecipientsPanel
              documentTitle={document.title}
              sending={sending}
              onSend={(payload) => void handleSend(payload)}
            />
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
            <SendRecipientsPanel
              documentTitle={document.title}
              sending={sending}
              onSend={(payload) => void handleSend(payload)}
            />
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
        title="HR Electronic Signature"
        description="Approve this document. Your electronic signature will be generated from your name and stored on the file."
        confirmLabel="Approve & Sign"
        isSubmitting={signing}
        onClose={() => setHrSignOpen(false)}
        onConfirm={(name) => void handleHrSign(name)}
      />
    </div>
  );
}
