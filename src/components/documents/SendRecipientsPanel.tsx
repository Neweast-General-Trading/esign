import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, Mail, Send, Users } from "lucide-react";
import { DataTablePagination, DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePaginatedList } from "@/hooks/useTableControls";
import { fetchEmployees } from "@/lib/api";
import { cn } from "@/lib/utils";

export const DEFAULT_EMAIL_SUBJECT = "Action required: sign {{documentTitle}}";

export const DEFAULT_EMAIL_BODY = `Dear {{employeeName}},

You have been requested to electronically sign the following document.

Please use the secure button in this email. Your link is personal and should not be shared.

Regards,
NEWEAST E-Sign`;

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
  }) => void;
}

export default function SendRecipientsPanel({
  documentTitle,
  sending,
  onSend,
}: SendRecipientsPanelProps) {
  const [mode, setMode] = useState<SendMode>("selected");
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });

  const employees = data?.employees ?? [];
  const departments = data?.departments ?? [];
  const companies = data?.companies ?? [];

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((emp) => {
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
  }, [employees, query, companyFilter]);

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
          : selectedEmails.length;

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((item) => item !== email) : [...prev, email],
    );
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

  const handleSend = () => {
    const recipients =
      mode === "selected"
        ? employees
            .filter((emp) => selectedEmails.includes(emp.email))
            .map((emp) => ({ name: emp.name, email: emp.email }))
        : [];

    onSend({
      mode,
      recipients,
      departmentCodes: selectedDepartments,
      companyCodes: selectedCompanies,
      emailSubject,
      emailBody,
    });
  };

  return (
    <section className="app-surface space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-red-600" />
        <h3 className="text-sm font-bold text-slate-900">Send for E-Sign</h3>
      </div>
      <p className="text-xs text-slate-500">
        Choose all employees, companies, departments, or specific people for{" "}
        <span className="font-semibold text-slate-700">{documentTitle}</span>.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", "All employees"],
            ["company", "By company"],
            ["department", "By department"],
            ["selected", "Selected employees"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={mode === value ? "default" : "outline"}
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading employees across companies...
        </div>
      ) : error ? (
        <p className="text-xs text-red-600">
          {error instanceof Error ? error.message : "Failed to load employees"}
        </p>
      ) : (
        <>
          {mode === "all" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-xs text-emerald-800">
              <Users className="mb-1 inline h-3.5 w-3.5" /> Will send to all{" "}
              <strong>{employees.length}</strong> active employees across{" "}
              <strong>{companies.length}</strong> companies.
            </div>
          ) : null}

          {mode === "company" ? (
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

          {mode === "department" ? (
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
            <div className="space-y-2">
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
                    employeePageItems.map((emp) => {
                      const active = selectedEmails.includes(emp.email);
                      return (
                        <button
                          key={`${emp.companyCode}:${emp.email}`}
                          type="button"
                          onClick={() => toggleEmail(emp.email)}
                          className={cn(
                            "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition",
                            active ? "bg-red-50" : "hover:bg-slate-50",
                          )}
                        >
                          <input type="checkbox" readOnly checked={active} className="mt-1" />
                          <div className="min-w-0">
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
                        </button>
                      );
                    })
                  )}
                </div>
                <DataTablePagination
                  page={employeePage}
                  totalPages={employeeTotalPages}
                  rangeLabel={employeeRangeLabel}
                  onPageChange={setEmployeePage}
                />
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-600" />
          <h4 className="text-xs font-bold text-slate-900">Email template</h4>
        </div>
        <p className="text-[11px] text-slate-500">
          Placeholders: {"{{employeeName}}"}, {"{{documentTitle}}"}, {"{{documentType}}"},{" "}
          {"{{hrName}}"}, {"{{designation}}"}, {"{{department}}"}, {"{{companyName}}"}.
          A personal secure Sign button is always added automatically for each employee.
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
        {sending ? "Sending..." : `Send to ${selectedCount} employee${selectedCount === 1 ? "" : "s"}`}
      </Button>
    </section>
  );
}
