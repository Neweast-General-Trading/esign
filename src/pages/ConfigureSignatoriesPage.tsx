import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  Loader2,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchEmployees, sendDocumentApi } from "@/lib/api";
import type { EmployeeDirectoryItem } from "@/lib/api";
import { APP_NAME } from "@/lib/branding";
import type { SignDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConfigureSignatoriesPageProps {
  document: SignDocument;
  onBack: () => void;
  onSent: (doc: SignDocument) => void;
}

type StepPerson = {
  id: string;
  name: string;
  email: string;
  designation?: string;
  department?: string;
  external?: boolean;
};

type SigningStepDraft = {
  id: string;
  label: string;
  /** When true, all people in the step must sign before the next step is notified */
  requireAll: boolean;
  people: StepPerson[];
};

type PickMode = "selected" | "company" | "department" | "all";

const DEFAULT_EMAIL_SUBJECT = "Action required: sign {{documentTitle}}";
const DEFAULT_EMAIL_BODY = `Dear {{employeeName}},

You have been requested to sign the following document via E-Sign.

Please use the secure button in this email. Your link is personal and should not be shared.

Regards,
${APP_NAME}`;

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultSteps(): SigningStepDraft[] {
  return [
    { id: newId(), label: "Employees", requireAll: false, people: [] },
    { id: newId(), label: "Manager", requireAll: true, people: [] },
  ];
}

function toStepPerson(emp: EmployeeDirectoryItem): StepPerson {
  return {
    id: newId(),
    name: emp.name,
    email: emp.email,
    designation: emp.designation,
    department: emp.department,
  };
}

export default function ConfigureSignatoriesPage({
  document,
  onBack,
  onSent,
}: ConfigureSignatoriesPageProps) {
  const [steps, setSteps] = useState<SigningStepDraft[]>(() => {
    if (!document.recipients.length) return defaultSteps();
    const grouped = new Map<number, SigningStepDraft>();
    const sorted = [...document.recipients].sort((a, b) => {
      const stepA = a.signingStep || a.signingOrder || 1;
      const stepB = b.signingStep || b.signingOrder || 1;
      if (stepA !== stepB) return stepA - stepB;
      return (a.signingOrder || 0) - (b.signingOrder || 0);
    });
    for (const r of sorted) {
      const stepNo = r.signingStep || r.signingOrder || 1;
      if (!grouped.has(stepNo)) {
        grouped.set(stepNo, {
          id: newId(),
          label: r.stepLabel || (stepNo === 1 ? "Employees" : `Step ${stepNo}`),
          requireAll: r.stepRequireAll !== false,
          people: [],
        });
      }
      grouped.get(stepNo)!.people.push({
        id: r.id,
        name: r.name,
        email: r.email,
      });
    }
    const restored = [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, step]) => step);
    return restored.length ? restored : defaultSteps();
  });

  const [activeStepId, setActiveStepId] = useState(steps[0]?.id || "");
  const [pickMode, setPickMode] = useState<PickMode>("selected");
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);
  const [sending, setSending] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const employees = data?.employees ?? [];
  const departments = data?.departments ?? [];
  const companies = data?.companies ?? [];

  const selectedEmails = useMemo(() => {
    const set = new Set<string>();
    for (const step of steps) {
      for (const person of step.people) set.add(person.email.toLowerCase());
    }
    return set;
  }, [steps]);

  const fieldMap = useMemo(() => {
    return steps.map((step, stepIndex) => ({
      step,
      stepNo: stepIndex + 1,
      members: step.people,
    }));
  }, [steps]);

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((emp) => {
      if (selectedEmails.has(emp.email.toLowerCase())) return false;
      if (companyFilter !== "all" && emp.companyCode !== companyFilter) return false;
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.designation.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        emp.companyName.toLowerCase().includes(q)
      );
    });
  }, [employees, query, selectedEmails, companyFilter]);

  const bulkPreviewCount = useMemo(() => {
    if (pickMode === "all") {
      return employees.filter((emp) => !selectedEmails.has(emp.email.toLowerCase())).length;
    }
    if (pickMode === "company") {
      return employees.filter(
        (emp) =>
          selectedCompanies.includes(emp.companyCode) &&
          !selectedEmails.has(emp.email.toLowerCase()),
      ).length;
    }
    if (pickMode === "department") {
      return employees.filter(
        (emp) =>
          emp.departmentCode !== null &&
          selectedDepartments.includes(emp.departmentCode) &&
          !selectedEmails.has(emp.email.toLowerCase()),
      ).length;
    }
    return 0;
  }, [pickMode, employees, selectedEmails, selectedCompanies, selectedDepartments]);

  const activeStep = steps.find((s) => s.id === activeStepId) || steps[0];

  const updateStep = (stepId: string, patch: Partial<SigningStepDraft>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
  };

  const addStep = () => {
    const id = newId();
    setSteps((prev) => [
      ...prev,
      { id, label: `Step ${prev.length + 1}`, requireAll: true, people: [] },
    ]);
    setActiveStepId(id);
  };

  const removeStep = (stepId: string) => {
    setSteps((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((s) => s.id !== stepId);
      if (activeStepId === stepId) setActiveStepId(next[0]?.id || "");
      return next;
    });
  };

  const moveStep = (stepId: string, direction: -1 | 1) => {
    setSteps((prev) => {
      const index = prev.findIndex((s) => s.id === stepId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  };

  const addPersonToActive = (person: StepPerson) => {
    if (!activeStep) return;
    if (selectedEmails.has(person.email.toLowerCase())) {
      toast.error("This person is already assigned to a step");
      return;
    }
    updateStep(activeStep.id, {
      people: [...activeStep.people, person],
    });
  };

  const addManyToActive = (incoming: EmployeeDirectoryItem[]) => {
    if (!activeStep) return;
    const fresh = incoming.filter(
      (emp) => !selectedEmails.has(emp.email.toLowerCase()),
    );
    if (!fresh.length) {
      toast.message("Everyone from this selection is already assigned");
      return;
    }
    updateStep(activeStep.id, {
      people: [...activeStep.people, ...fresh.map(toStepPerson)],
    });
    toast.success(
      `Added ${fresh.length} people to “${activeStep.label || "this step"}”`,
    );
  };

  const addBulkSelection = () => {
    if (pickMode === "all") {
      addManyToActive(employees);
      return;
    }
    if (pickMode === "company") {
      if (!selectedCompanies.length) {
        toast.error("Select at least one company");
        return;
      }
      addManyToActive(
        employees.filter((emp) => selectedCompanies.includes(emp.companyCode)),
      );
      return;
    }
    if (pickMode === "department") {
      if (!selectedDepartments.length) {
        toast.error("Select at least one department");
        return;
      }
      addManyToActive(
        employees.filter(
          (emp) =>
            emp.departmentCode !== null &&
            selectedDepartments.includes(emp.departmentCode),
        ),
      );
    }
  };

  const removePerson = (stepId: string, personId: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId
          ? { ...step, people: step.people.filter((p) => p.id !== personId) }
          : step,
      ),
    );
  };

  const clearStepPeople = (stepId: string) => {
    updateStep(stepId, { people: [] });
  };

  const addGuest = () => {
    const name = guestName.trim();
    const email = guestEmail.trim().toLowerCase();
    if (!name || !email.includes("@")) {
      toast.error("Enter guest name and a valid email");
      return;
    }
    addPersonToActive({ id: newId(), name, email, external: true });
    setGuestName("");
    setGuestEmail("");
  };

  const handleStart = async () => {
    const empty = steps.find((s) => !s.people.length);
    if (empty) {
      toast.error(`Add at least one person to “${empty.label || "each step"}”`);
      return;
    }
    if (!steps.length) {
      toast.error("Add at least one signing step");
      return;
    }

    setSending(true);
    try {
      const updated = await sendDocumentApi(document.id, {
        mode: "steps",
        signingMode: "sequential",
        steps: steps.map((step) => ({
          label: step.label.trim() || "Step",
          requireAll: false,
          recipients: step.people.map((p) => ({
            name: p.name,
            email: p.email,
          })),
        })),
        emailSubject,
        emailBody,
      });

      if (updated.mailError) {
        toast.error(updated.mailError);
      } else if ((updated.privateCopyCount || updated.privateCopies?.length || 0) > 1) {
        toast.success(
          `Created ${updated.privateCopyCount || updated.privateCopies?.length} private copies — each employee signs alone, then the manager signs that same copy.`,
        );
      } else {
        const first = steps[0];
        toast.success(
          `Started — emailed Step 1 (${first?.label || "first step"}): ${first?.people.length || 0} person(s)`,
        );
      }
      onSent(updated.privateCopies?.[0] || updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start signing");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Who must sign?</h2>
            <p className="mt-1 text-sm text-slate-500">
              Document: <span className="font-medium text-slate-800">{document.title}</span>
            </p>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Build the flow by <strong>steps</strong>. Example: Step 1 = employees, Step 2 =
              manager. If you add several people in Step 1, each one gets a{" "}
              <strong>private copy</strong> — they sign alone, then the manager signs that same
              copy. Peers never see each other&apos;s signatures.
            </p>
            <p className="mt-2 max-w-2xl text-sm font-medium text-red-800">
              In the document editor, assign signature / fillable fields to{" "}
              <strong>Step 1</strong>, <strong>Step 2</strong>, … — same numbers as these steps
              (not the individual person count).
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => void handleStart()} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Starting..." : "Start signing"}
        </Button>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
        <div className="font-semibold">How it works (private copies)</div>
        <ul className="mt-1.5 list-disc space-y-1 ps-5 text-xs leading-relaxed text-sky-900/90">
          <li>
            <strong>10 employees + manager</strong> → 10 separate documents. Each employee only
            sees their own form.
          </li>
          <li>
            After the employee signs, the <strong>manager is emailed that same private copy</strong>{" "}
            and signs it. Result: one PDF signed by both parties only.
          </li>
          <li>
            Use <strong>All employees / By company / By department</strong> to fill Step 1
            quickly, then add the manager in Step 2.
          </li>
        </ul>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="app-surface space-y-3 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">Signing steps</h3>
            <Button type="button" size="sm" variant="outline" onClick={addStep}>
              <Plus className="h-3.5 w-3.5" />
              Add step
            </Button>
          </div>

          <div className="space-y-3">
            {fieldMap.map(({ step, stepNo, members }, index) => {
              const active = step.id === activeStep?.id;
              const preview = members.slice(0, 8);
              const hidden = members.length - preview.length;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-xl border p-3 transition",
                    active
                      ? "border-red-300 bg-red-50/40 ring-1 ring-red-200"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveStepId(step.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white"
                    >
                      {stepNo}
                    </button>
                    <Input
                      value={step.label}
                      onChange={(e) => updateStep(step.id, { label: e.target.value })}
                      onFocus={() => setActiveStepId(step.id)}
                      className="h-9 max-w-xs text-sm font-semibold"
                      placeholder="Step name (e.g. Employees)"
                    />
                    <div className="ms-auto flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => moveStep(step.id, -1)}
                        aria-label="Move step up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={index === steps.length - 1}
                        onClick={() => moveStep(step.id, 1)}
                        aria-label="Move step down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={steps.length <= 1}
                        onClick={() => removeStep(step.id)}
                        aria-label="Remove step"
                      >
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span>
                      {members.length === 0
                        ? "No people yet — select this step and add people on the right."
                        : members.length === 1
                          ? "1 person in this step"
                          : `${members.length} people in this step`}
                    </span>
                    {members.length > 0 ? (
                      <button
                        type="button"
                        className="font-semibold text-rose-700 hover:underline"
                        onClick={() => clearStepPeople(step.id)}
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-900">
                    {stepNo === 1 && members.length > 1 ? (
                      <>
                        <span className="font-semibold">Private copies:</span> each of these{" "}
                        {members.length} people will receive their own document. Later steps
                        (manager) sign that same private copy — signatures stay between those
                        two parties only.
                      </>
                    ) : stepNo === 1 ? (
                      <>
                        This person signs first. After they sign, the next step (e.g. manager)
                        is notified on <span className="font-semibold">this same document</span>.
                      </>
                    ) : (
                      <>
                        Signs after Step 1 is done — on each employee&apos;s private copy
                        separately.
                      </>
                    )}
                  </p>

                  <div className="mt-2 space-y-1.5">
                    {preview.map((person) => (
                      <div
                        key={person.id}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                      >
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                          Step {stepNo}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-slate-900">{person.name}</div>
                          <div className="truncate text-slate-500">{person.email}</div>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removePerson(step.id, person.id)}
                          aria-label="Remove person"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {hidden > 0 ? (
                      <p className="px-1 text-[11px] text-slate-500">
                        + {hidden} more (not shown — use Clear all to reset)
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="app-surface space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-red-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Add people to: {activeStep?.label || "selected step"}
            </h3>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["selected", "Pick people"],
                ["company", "By company"],
                ["department", "By department"],
                ["all", "All employees"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={pickMode === value ? "default" : "outline"}
                onClick={() => setPickMode(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading directory...
            </div>
          ) : error ? (
            <p className="text-xs text-rose-600">
              {error instanceof Error ? error.message : "Failed to load employees"}
            </p>
          ) : pickMode === "all" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-xs text-emerald-900">
                Add all <strong>{employees.length}</strong> active employees across{" "}
                <strong>{companies.length}</strong> companies to this step
                {bulkPreviewCount < employees.length
                  ? ` (${bulkPreviewCount} not already assigned).`
                  : "."}
              </div>
              <Button type="button" size="sm" onClick={addBulkSelection} disabled={!bulkPreviewCount}>
                <Plus className="h-3.5 w-3.5" />
                Add all ({bulkPreviewCount})
              </Button>
            </div>
          ) : pickMode === "company" ? (
            <div className="space-y-3">
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {companies.map((company) => {
                  const count = employees.filter((emp) => emp.companyCode === company.code).length;
                  const active = selectedCompanies.includes(company.code);
                  return (
                    <button
                      key={company.code}
                      type="button"
                      onClick={() =>
                        setSelectedCompanies((prev) =>
                          prev.includes(company.code)
                            ? prev.filter((c) => c !== company.code)
                            : [...prev, company.code],
                        )
                      }
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition",
                        active ? "bg-red-50 text-red-800" : "hover:bg-slate-50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-semibold">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{company.name}</span>
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {company.code}
                        </span>
                      </span>
                      <span className="shrink-0 text-slate-500">{count}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={addBulkSelection}
                disabled={!selectedCompanies.length || !bulkPreviewCount}
              >
                <Plus className="h-3.5 w-3.5" />
                Add selected companies ({bulkPreviewCount})
              </Button>
            </div>
          ) : pickMode === "department" ? (
            <div className="space-y-3">
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {departments.map((dept) => {
                  const count = employees.filter((emp) => emp.departmentCode === dept.code).length;
                  const active = selectedDepartments.includes(dept.code);
                  return (
                    <button
                      key={dept.code}
                      type="button"
                      onClick={() =>
                        setSelectedDepartments((prev) =>
                          prev.includes(dept.code)
                            ? prev.filter((c) => c !== dept.code)
                            : [...prev, dept.code],
                        )
                      }
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition",
                        active ? "bg-red-50 text-red-800" : "hover:bg-slate-50",
                      )}
                    >
                      <span className="font-semibold">{dept.name}</span>
                      <span className="text-slate-500">{count}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={addBulkSelection}
                disabled={!selectedDepartments.length || !bulkPreviewCount}
              >
                <Plus className="h-3.5 w-3.5" />
                Add selected departments ({bulkPreviewCount})
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-500/20"
                >
                  <option value="all">All companies</option>
                  {companies.map((company) => (
                    <option key={company.code} value={company.code}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, company..."
                  className="h-9 min-w-[12rem] flex-1 text-sm"
                />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5">
                {filteredEmployees.slice(0, 40).map((emp) => (
                  <button
                    key={`${emp.companyCode}:${emp.email}`}
                    type="button"
                    onClick={() => addPersonToActive(toStepPerson(emp))}
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{emp.name}</div>
                      <div className="truncate text-slate-500">{emp.email}</div>
                      <div className="truncate text-[10px] text-slate-400">
                        {[emp.companyName, emp.designation, emp.department]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                ))}
                {!filteredEmployees.length ? (
                  <p className="px-2 py-4 text-center text-[11px] text-slate-400">
                    No matching employees
                  </p>
                ) : null}
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-dashed border-slate-200 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              External guest
            </div>
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Full name"
              className="h-9 text-sm"
            />
            <Input
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="email@example.com"
              className="h-9 text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={addGuest}>
              <Plus className="h-3.5 w-3.5" />
              Add guest to this step
            </Button>
          </div>
        </section>
      </div>

      <section className="app-surface space-y-3 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-slate-900">Email template</h3>
        <div className="space-y-2">
          <Label htmlFor="sign-subject">Subject</Label>
          <Input
            id="sign-subject"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sign-body">Body</Label>
          <textarea
            id="sign-body"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-500/20"
          />
        </div>
      </section>
    </div>
  );
}
