import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Loader2,
  Mail,
  Send,
  Users,
} from "lucide-react";
import { DataTablePagination, DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePaginatedList } from "@/hooks/useTableControls";
import { fetchEmployees } from "@/lib/api";
import type { SigningMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/branding";

export const DEFAULT_EMAIL_SUBJECT = "Action required: sign {{documentTitle}}";

export const DEFAULT_EMAIL_BODY = `Dear {{employeeName}},

You have been requested to sign the following document via E-Sign.

Please use the secure button in this email. Your link is personal and should not be shared.

Regards,
${APP_NAME}`;

type SendMode = "all" | "selected" | "department" | "company";

interface SendRecipientsPanelProps {
  documentTitle: string;
  sending: boolean;
  onSend: (payload: {
    mode: SendMode;
    recipients: Array<{ name: string; email: string }>;
    departmentCodes: number[];
    companyCodes: string[];
    emailSubject: string;
    emailBody: string;
    signingMode: SigningMode;
  }) => void;
}

type SignerItem = {
  id: string;
  empId: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  departmentCode: number | null;
  companyCode: string;
  companyName: string;
  external?: boolean;
};

export default function SendRecipientsPanel({
  documentTitle,
  sending,
  onSend,
}: SendRecipientsPanelProps) {
  const [mode, setMode] = useState<SendMode>("selected");
  const [signingMode, setSigningMode] = useState<SigningMode>("sequential");
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [orderedSigners, setOrderedSigners] = useState<SignerItem[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestError, setGuestError] = useState("");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const employees = data?.employees ?? [];
  const departments = data?.departments ?? [];
  const companies = data?.companies ?? [];

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selected = new Set(orderedSigners.map((s) => s.email.toLowerCase()));
    return employees.filter((emp) => {
      if (selected.has(emp.email.toLowerCase())) return false;
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
  }, [employees, query, companyFilter, orderedSigners]);

  const {
    page: employeePage,
    setPage: setEmployeePage,
    pageItems: employeePageItems,
    totalPages: employeeTotalPages,
    rangeLabel: employeeRangeLabel,
  } = usePaginatedList(filteredEmployees, 12, `${companyFilter}|${query}|${mode}`);

  const selectedCount =
    mode === "all"
      ? employees.length
      : mode === "company"
        ? employees.filter((emp) => selectedCompanies.includes(emp.companyCode)).length
        : mode === "department"
          ? employees.filter(
              (emp) =>
                emp.departmentCode !== null &&
                selectedDepartments.includes(emp.departmentCode),
            ).length
          : orderedSigners.length;

  const addSigner = (emp: SignerItem) => {
    setOrderedSigners((prev) => {
      if (prev.some((item) => item.email.toLowerCase() === emp.email.toLowerCase())) {
        return prev;
      }
      return [...prev, emp];
    });
  };

  const addGuestSigner = () => {
    setGuestError("");
    const name = guestName.trim();
    const email = guestEmail.trim().toLowerCase();
    if (!name) {
      setGuestError("Guest name is required");
      return;
    }
    if (!email.includes("@")) {
      setGuestError("Enter a valid email address");
      return;
    }
    if (orderedSigners.some((item) => item.email.toLowerCase() === email)) {
      setGuestError("This email is already in the signing queue");
      return;
    }
    addSigner({
      id: `external:${email}`,
      empId: "",
      name,
      email,
      designation: "External guest",
      department: "",
      departmentCode: null,
      companyCode: "EXTERNAL",
      companyName: "External",
      external: true,
    });
    setGuestName("");
    setGuestEmail("");
  };

  const removeSigner = (email: string) => {
    setOrderedSigners((prev) =>
      prev.filter((item) => item.email.toLowerCase() !== email.toLowerCase()),
    );
  };

  const moveSigner = (index: number, direction: -1 | 1) => {
    setOrderedSigners((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  };

  const toggleDepartment = (code: number) => {
    setSelectedDepartments((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  };

  const toggleCompany = (code: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  };

  const effectiveSigningMode: SigningMode =
    mode === "selected" ? signingMode : "parallel";

  const handleSend = () => {
    const recipients =
      mode === "selected"
        ? orderedSigners.map((emp) => ({ name: emp.name, email: emp.email }))
        : [];

    onSend({
      mode,
      recipients,
      departmentCodes: selectedDepartments,
      companyCodes: selectedCompanies,
      emailSubject,
      emailBody,
      signingMode: effectiveSigningMode,
    });
  };

  return (
    <section className="app-surface space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-red-600" />
        <h3 className="text-sm font-bold text-slate-900">Send for {APP_NAME}</h3>
      </div>
      <p className="text-xs text-slate-500">
        Add signatories in the order they should sign. Signatory #1 matches signature field
        &quot;Signatory #1&quot; in the document. The uploader is <strong>not</strong> automatically
        a signatory.
      </p>
      <p className="text-xs text-slate-500">
        Document: <span className="font-semibold text-slate-700">{documentTitle}</span>
      </p>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["selected", "Ordered signatories"],
            ["company", "By company"],
            ["department", "By department"],
            ["all", "All employees"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={mode === value ? "default" : "outline"}
            onClick={() => {
              setMode(value);
              if (value !== "selected") setSigningMode("parallel");
              else setSigningMode("sequential");
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      {mode === "selected" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Signing order
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={signingMode === "sequential" ? "default" : "outline"}
              onClick={() => setSigningMode("sequential")}
            >
              Sequential (recommended)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={signingMode === "parallel" ? "default" : "outline"}
              onClick={() => setSigningMode("parallel")}
            >
              All at once
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {signingMode === "sequential"
              ? "Signatory 2 receives the email only after Signatory 1 has signed — like BI E-Sign."
              : "Every selected person receives the email immediately."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
          Mass send uses parallel delivery (everyone is notified together).
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading employees across companies...
        </div>
      ) : error ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 text-xs text-amber-900">
          <p>
            Employee directory is slow or unavailable right now. You can still add{" "}
            <strong>external guests</strong> by email below.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "Retrying..." : "Retry loading employees"}
          </Button>
        </div>
      ) : null}

      {mode === "selected" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            External guest (outside company)
          </div>
          <p className="text-[11px] text-slate-500">
            Use this for candidates, partners, or anyone not in the employee directory.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="guest-name">Full name</Label>
              <Input
                id="guest-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Candidate name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </div>
          {guestError ? <p className="text-xs text-red-600">{guestError}</p> : null}
          <Button type="button" size="sm" variant="outline" onClick={addGuestSigner}>
            Add external guest
          </Button>
        </div>
      ) : null}

      {!isLoading && !error && mode === "all" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-xs text-emerald-800">
              <Users className="mb-1 inline h-3.5 w-3.5" /> Will send to all{" "}
              <strong>{employees.length}</strong> active employees across{" "}
              <strong>{companies.length}</strong> companies.
            </div>
          ) : null}

          {!isLoading && !error && mode === "company" ? (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {companies.map((company) => {
                const count = employees.filter((emp) => emp.companyCode === company.code).length;
                const active = selectedCompanies.includes(company.code);
                return (
                  <button
                    key={company.code}
                    type="button"
                    onClick={() => toggleCompany(company.code)}
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
                      <span className="mt-0.5 block text-[10px] text-slate-400">{company.code}</span>
                    </span>
                    <span className="shrink-0 text-slate-500">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!isLoading && !error && mode === "department" ? (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {departments.map((dept) => {
                const count = employees.filter((emp) => emp.departmentCode === dept.code).length;
                const active = selectedDepartments.includes(dept.code);
                return (
                  <button
                    key={dept.code}
                    type="button"
                    onClick={() => toggleDepartment(dept.code)}
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
          ) : null}

          {mode === "selected" ? (
            <div className="space-y-3">
              {orderedSigners.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-slate-200 p-2">
                  <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Signing queue ({orderedSigners.length})
                  </div>
                  {orderedSigners.map((emp, index) => (
                    <div
                      key={`${emp.companyCode}:${emp.email}`}
                      className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-900">
                          {emp.name}
                          {emp.external ? (
                            <span className="ms-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              External
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">{emp.email}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={index === 0}
                          onClick={() => moveSigner(index, -1)}
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={index === orderedSigners.length - 1}
                          onClick={() => moveSigner(index, 1)}
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-[11px]"
                          onClick={() => removeSigner(emp.email)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-500">
                  Add employees or an external guest above. Example: Head of HR first, then the
                  candidate.
                </div>
              )}

              {!isLoading && !error ? (
                <>
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-red-300 focus:ring-2 focus:ring-red-500/20"
                  >
                    <option value="all">All companies</option>
                    {companies.map((company) => (
                      <option key={company.code} value={company.code}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                  <DataTableToolbar
                    query={query}
                    onQueryChange={setQuery}
                    searchPlaceholder="Search name, email, company, designation..."
                  />
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="max-h-64 space-y-1 overflow-y-auto p-2">
                      {employeePageItems.length === 0 ? (
                        <p className="px-2 py-6 text-center text-[11px] text-slate-400">
                          No employees match this filter.
                        </p>
                      ) : (
                        employeePageItems.map((emp) => (
                          <button
                            key={`${emp.companyCode}:${emp.email}`}
                            type="button"
                            onClick={() => addSigner(emp)}
                            className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-semibold text-slate-900">
                                {emp.name}
                              </div>
                              <div className="truncate text-[11px] text-slate-500">{emp.email}</div>
                              <div className="truncate text-[11px] text-slate-400">
                                {[emp.companyName, emp.designation, emp.department]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-red-600">
                              Add
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                    <DataTablePagination
                      page={employeePage}
                      totalPages={employeeTotalPages}
                      rangeLabel={employeeRangeLabel}
                      onPageChange={setEmployeePage}
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-600" />
          <h4 className="text-xs font-bold text-slate-900">Email template</h4>
        </div>
        <p className="text-[11px] text-slate-500">
          Placeholders: {"{{employeeName}}"}, {"{{documentTitle}}"}, {"{{documentType}}"},{" "}
          {"{{hrName}}"}, {"{{designation}}"}, {"{{department}}"}, {"{{companyName}}"}.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="email-subject">Subject</Label>
          <Input
            id="email-subject"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email-body">Body</Label>
          <textarea
            id="email-body"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={8}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-red-300 focus:ring-2 focus:ring-red-500/20"
          />
        </div>
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={sending || selectedCount === 0 || !emailSubject.trim() || !emailBody.trim()}
        onClick={handleSend}
      >
        <Mail className="h-4 w-4" />
        {sending
          ? "Sending..."
          : effectiveSigningMode === "sequential"
            ? `Start sequential signing (${selectedCount})`
            : `Send to ${selectedCount} employee${selectedCount === 1 ? "" : "s"}`}
      </Button>
    </section>
  );
}
