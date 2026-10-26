import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FilePenLine,
  FileText,
  Inbox,
  Layers3,
  Percent,
  Send,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { fetchDashboardSummary, fetchDocuments } from "@/lib/api";
import { STATUS_LABELS, type SignDocument } from "@/lib/types";
import { statusDot } from "@/lib/status";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { APP_NAME } from "@/lib/branding";

interface DashboardPageProps {
  onCreateNew: () => void;
  onOpenDocument: (doc: SignDocument) => void;
  onBrowseDocuments: () => void;
}

function StatCard({
  label,
  value,
  icon,
  tone,
  hint,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: string;
  hint?: string;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "min-w-[150px] flex-1 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-left shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)] transition",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("rounded-xl p-2.5", tone)}>{icon}</div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold tabular-nums text-slate-900">
            {value}
          </div>
          {hint ? <div className="mt-1 text-[10px] font-medium text-slate-400">{hint}</div> : null}
        </div>
      </div>
      <div className="mt-3 text-xs font-semibold text-slate-700">{label}</div>
    </Component>
  );
}

function PipelineBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="tabular-nums font-medium text-slate-500">
          {value} · {percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage({
  onCreateNew,
  onOpenDocument,
  onBrowseDocuments,
}: DashboardPageProps) {
  const { user } = useAuth();
  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
  });
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
  });

  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const total = summary?.total ?? documents.length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff,#fff7f7_40%,#f0fdf4)] shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-red-600">
              {APP_NAME.toUpperCase()} WORKSPACE
            </p>
            <h2 className="mt-2 font-display text-3xl tracking-tight text-slate-900">
              {greeting}, {user?.name?.split(" ")[0] || "there"}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Monitor signature pipelines, overdue recipients, and document completion across
              the HR workspace.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
              <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1">
                Signed in as {user?.email}
              </span>
              {summary?.overdueAwaiting ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                  {summary.overdueAwaiting} overdue awaiting
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBrowseDocuments}>
              Browse documents
            </Button>
            <Button onClick={onCreateNew}>New Document</Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatCard
          label="Total Documents"
          value={summary?.total ?? 0}
          icon={<Layers3 className="h-4 w-4" />}
          tone="bg-slate-100 text-slate-600"
          onClick={onBrowseDocuments}
        />
        <StatCard
          label="Awaiting Signatures"
          value={summary?.awaitingSignatures ?? 0}
          icon={<Inbox className="h-4 w-4" />}
          tone="bg-amber-100 text-amber-700"
          hint={`${summary?.pendingRecipients ?? 0} people pending`}
        />
        <StatCard
          label="Completed"
          value={summary?.completed ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="bg-emerald-100 text-emerald-700"
          hint={`${summary?.signedThisMonth ?? 0} this month`}
        />
        <StatCard
          label="Completion Rate"
          value={`${summary?.completionRate ?? 0}%`}
          icon={<Percent className="h-4 w-4" />}
          tone="bg-sky-100 text-sky-700"
          hint={`${summary?.signedRecipients ?? 0} signatures collected`}
        />
        <StatCard
          label="Drafts"
          value={summary?.draft ?? 0}
          icon={<FilePenLine className="h-4 w-4" />}
          tone="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="HR Signed"
          value={summary?.hrSigned ?? 0}
          icon={<FileCheck2 className="h-4 w-4" />}
          tone="bg-blue-100 text-blue-700"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="app-surface rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Signature pipeline</h3>
              <p className="mt-1 text-xs text-slate-500">{total} documents in the workspace</p>
            </div>
            <Send className="h-4 w-4 text-slate-400" />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <PipelineBar label="Draft" value={summary?.draft ?? 0} total={total} color="bg-slate-400" />
            <PipelineBar label="HR Signed" value={summary?.hrSigned ?? 0} total={total} color="bg-blue-500" />
            <PipelineBar label="Sent" value={summary?.sent ?? 0} total={total} color="bg-amber-500" />
            <PipelineBar
              label="Partial"
              value={summary?.partiallySigned ?? 0}
              total={total}
              color="bg-violet-500"
            />
            <PipelineBar
              label="Completed"
              value={summary?.completed ?? 0}
              total={total}
              color="bg-emerald-500"
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(summary?.byDocumentType ?? []).slice(0, 6).map((item) => (
              <div
                key={item.type}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
              >
                <div className="text-xs font-semibold text-slate-800">{item.type}</div>
                <div className="mt-2 flex items-end justify-between">
                  <div className="font-display text-xl font-semibold text-slate-900">
                    {item.count}
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    {item.completed} completed
                  </div>
                </div>
              </div>
            ))}
            {(summary?.byDocumentType ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
                Document type mix will appear once you create documents.
              </div>
            ) : null}
          </div>
        </section>

        <section className="app-surface rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Needs attention</h3>
          </div>
          {(summary?.topAwaiting ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500">
              Nothing waiting on employees right now.
            </div>
          ) : (
            <div className="space-y-2">
              {(summary?.topAwaiting ?? []).map((item) => {
                const doc = byId.get(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-red-200 hover:bg-red-50/30"
                    onClick={() => doc && onOpenDocument(doc)}
                    disabled={!doc}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {item.documentType} · updated {formatDate(item.updatedAt)}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      {item.pendingCount}/{item.recipientCount} pending
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="app-surface rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Recent activity</h3>
          </div>
          {isLoading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : (summary?.recentActivity ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {(summary?.recentActivity ?? []).map((item) => {
                const doc = byId.get(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => doc && onOpenDocument(doc)}
                    disabled={!doc}
                    className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 px-3.5 py-3 text-left transition hover:border-red-200 hover:bg-red-50/20"
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                        statusDot(item.status),
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {item.title}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                        <span>{STATUS_LABELS[item.status]}</span>
                        <span>{item.documentType}</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {item.signedCount}/{item.recipientCount}
                        </span>
                        <span>by {item.createdByName}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {formatDateTime(item.updatedAt)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="app-surface rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Workspace snapshot</h3>
            </div>
            <Button variant="outline" size="sm" onClick={onBrowseDocuments}>
              View all
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Pending people
              </div>
              <div className="mt-2 font-display text-3xl font-semibold text-slate-900">
                {summary?.pendingRecipients ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">Still waiting to confirm signature</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Collected signatures
              </div>
              <div className="mt-2 font-display text-3xl font-semibold text-slate-900">
                {summary?.signedRecipients ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">{APP_NAME} signatures stored</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Overdue (&gt;3 days)
              </div>
              <div className="mt-2 font-display text-3xl font-semibold text-amber-700">
                {summary?.overdueAwaiting ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">Documents waiting too long</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Signed this month
              </div>
              <div className="mt-2 font-display text-3xl font-semibold text-emerald-700">
                {summary?.signedThisMonth ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">Fully completed packages</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
