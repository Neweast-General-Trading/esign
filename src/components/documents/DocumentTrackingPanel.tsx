import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  Link2,
  Mail,
  PenLine,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DataTablePagination, DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Button } from "@/components/ui/button";
import { usePaginatedList } from "@/hooks/useTableControls";
import { remindRecipientApi } from "@/lib/api";
import type { RecipientPublic, SignDocument } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

interface DocumentTrackingPanelProps {
  document: SignDocument;
  onUpdated: (doc: SignDocument) => void;
}

type RecipientFilter = "all" | "pending" | "signed" | "viewed" | "declined";

const FILTERS: Array<{ id: RecipientFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "viewed", label: "Viewed" },
  { id: "signed", label: "Signed" },
  { id: "declined", label: "Declined" },
];

function recipientTone(status: RecipientPublic["status"]) {
  if (status === "signed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "declined") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function stageLabel(
  r: RecipientPublic,
  currentStepPendingIds: Set<string>,
) {
  if (r.status === "signed") return "Signed";
  if (r.status === "declined") return "Declined";
  if (currentStepPendingIds.has(r.id)) return "Current step";
  if (r.status === "pending" && !r.sentAt) return "Queued";
  if (r.viewedAt) return "Viewed";
  if (r.sentAt) return "Sent";
  return "Queued";
}

export default function DocumentTrackingPanel({
  document,
  onUpdated,
}: DocumentTrackingPanelProps) {
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecipientFilter>("all");
  const recipients = useMemo(
    () =>
      [...document.recipients].sort((a, b) => {
        const stepA = a.signingStep || a.signingOrder || 999;
        const stepB = b.signingStep || b.signingOrder || 999;
        if (stepA !== stepB) return stepA - stepB;
        return (a.signingOrder || 999) - (b.signingOrder || 999);
      }),
    [document.recipients],
  );
  const currentStepPendingIds = useMemo(() => {
    if (document.signingMode !== "sequential") return new Set<string>();
    const pending = recipients.filter((r) => r.status === "pending");
    if (!pending.length) return new Set<string>();
    const step = pending[0]!.signingStep || pending[0]!.signingOrder || 1;
    return new Set(
      pending
        .filter((r) => (r.signingStep || r.signingOrder || 1) === step)
        .map((r) => r.id),
    );
  }, [document.signingMode, recipients]);

  const stepGroups = useMemo(() => {
    const map = new Map<number, { label: string; items: RecipientPublic[] }>();
    for (const r of recipients) {
      const step = r.signingStep || r.signingOrder || 1;
      if (!map.has(step)) {
        map.set(step, {
          label: r.stepLabel || `Step ${step}`,
          items: [],
        });
      }
      map.get(step)!.items.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [recipients]);

  const stats = useMemo(() => {
    const signed = recipients.filter((r) => r.status === "signed").length;
    const pending = recipients.filter((r) => r.status === "pending").length;
    const viewed = recipients.filter((r) => Boolean(r.viewedAt) && r.status !== "signed").length;
    const declined = recipients.filter((r) => r.status === "declined").length;
    return { signed, pending, viewed, declined, total: recipients.length };
  }, [recipients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipients.filter((r) => {
      if (filter === "pending" && r.status !== "pending") return false;
      if (filter === "signed" && r.status !== "signed") return false;
      if (filter === "declined" && r.status !== "declined") return false;
      if (filter === "viewed" && !(r.viewedAt && r.status !== "signed")) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.signatureName || "").toLowerCase().includes(q)
      );
    });
  }, [recipients, query, filter]);

  const { page, setPage, pageItems, totalPages, rangeLabel } = usePaginatedList(
    filtered,
    8,
    `${filter}|${query}`,
  );

  const copyLink = async (url?: string) => {
    if (!url) {
      toast.error("Sign link is not available");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Sign link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const remind = async (recipientId: string) => {
    setRemindingId(recipientId);
    try {
      const result = await remindRecipientApi(document.id, recipientId);
      onUpdated(result.document);
      if (!result.ok) {
        toast.warning("Reminder prepared but email failed", {
          description: result.mailError,
        });
      } else {
        toast.success("Reminder email sent");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remind");
    } finally {
      setRemindingId(null);
    }
  };

  if (!recipients.length) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 p-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900">Signature tracking</h3>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          No signatories yet. Open <strong>Configure signatories</strong> to define steps
          (e.g. Employees, then Manager).
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#fff,#fef2f2_50%,#fff)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-red-600" />
              <h3 className="text-sm font-bold text-slate-900">Signature tracking</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {document.signingMode === "sequential"
                ? `Step-based flow — ${stepGroups
                    .map(([, g]) => `${g.label} (${g.items.length})`)
                    .join(" → ")}. Next step starts when the current step is fully signed.`
                : "Parallel delivery — signatories are notified together (or legacy documents)."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
              {stats.total} total
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
              {stats.signed} signed
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
              {stats.pending} pending
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700">
              {stats.viewed} viewed
            </span>
          </div>
        </div>

        <div className="mt-4">
          <DataTableToolbar
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="Search recipient name, email, signature..."
            filters={FILTERS}
            activeFilter={filter}
            onFilterChange={(id) => setFilter(id as RecipientFilter)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Field / Step</th>
              <th className="px-4 py-3 font-semibold">Recipient</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Sent</th>
              <th className="px-4 py-3 font-semibold">Viewed</th>
              <th className="px-4 py-3 font-semibold">Signed</th>
              <th className="px-4 py-3 font-semibold">Signature</th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No recipients match this filter.
                </td>
              </tr>
            ) : (
              pageItems.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-middle hover:bg-slate-50/70">
                  <td className="px-4 py-3 text-xs font-bold text-slate-500">
                    <div>Field #{r.signingOrder || "—"}</div>
                    <div className="mt-0.5 font-medium text-slate-400">
                      {r.stepLabel || `Step ${r.signingStep || r.signingOrder || "—"}`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.email}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        recipientTone(r.status),
                        currentStepPendingIds.has(r.id) && r.status === "pending"
                          ? "border-sky-200 bg-sky-50 text-sky-800"
                          : null,
                      )}
                    >
                      {r.status === "signed" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : r.viewedAt ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <Clock3 className="h-3 w-3" />
                      )}
                      {stageLabel(r, currentStepPendingIds)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {r.sentAt ? formatDateTime(r.sentAt) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {r.viewedAt ? formatDateTime(r.viewedAt) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {r.signedAt ? formatDateTime(r.signedAt) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {r.signatureName ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                        <PenLine className="h-3 w-3 text-red-500" />
                        {r.signatureName}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-nowrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 shrink-0 gap-1.5 px-3 text-xs"
                        onClick={() => void copyLink(r.signUrl)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Link
                      </Button>
                      {r.status !== "signed" &&
                      (document.signingMode !== "sequential" ||
                        currentStepPendingIds.has(r.id)) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 shrink-0 gap-1.5 px-3 text-xs"
                          disabled={remindingId === r.id}
                          onClick={() => void remind(r.id)}
                        >
                          {remindingId === r.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Mail className="h-3.5 w-3.5" />
                          )}
                          Remind
                        </Button>
                      ) : null}
                      {r.signUrl ? (
                        <a
                          href={r.signUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Open
                        </a>
                      ) : null}
                    </div>
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

      {document.hrSignature ? (
        <div className="border-t border-slate-200 bg-white px-5 py-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Optional company signature:</span>{" "}
          {document.hrSignature.name} · {formatDateTime(document.hrSignature.signedAt)}
          {document.hrSignature.ipAddress ? ` · IP ${document.hrSignature.ipAddress}` : ""}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 text-xs text-slate-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          No optional company signature from the uploader (this is normal for Offer Letters).
        </div>
      )}
    </section>
  );
}
