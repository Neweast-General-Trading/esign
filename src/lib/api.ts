import type { AuthUser, DashboardSummary, DocumentTypeDefinition, SignDocument } from "./types";

const TOKEN_KEY = "e-sign-auth-token";
const USER_KEY = "e-sign-auth-user";

export function loadAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function loadAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = loadAuthToken();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthSession();
    window.dispatchEvent(new Event("e-sign-auth-expired"));
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export function fetchAuthProfile() {
  return api<{ user: AuthUser }>("/auth/me");
}

export function loginWithPassword(email: string, password: string) {
  return api<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function loginOpen(email: string, name?: string) {
  return api<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, name }),
  });
}

export function exchangeIntranetLink(payload: {
  userId: string;
  otp: string;
  companyCode: string;
}) {
  return api<{ success: boolean; token: string; user: AuthUser }>("/auth/intranet-link", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function exchangeSsoToken(token: string) {
  return api<{ success: boolean; token: string; user: AuthUser }>("/auth/sso", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function devLogin(name: string, email: string) {
  return api<{ token: string; user: AuthUser }>("/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
}

export function fetchDashboardSummary() {
  return api<DashboardSummary>("/dashboard/summary");
}

export function fetchDocuments() {
  return api<SignDocument[]>("/documents");
}

export function fetchDocument(id: string) {
  return api<SignDocument>(`/documents/${id}`);
}

export function createDocumentApi(payload: {
  title: string;
  documentType: string;
  contentHtml: string;
  notes?: string;
  includeCompanySignature?: boolean;
}) {
  return api<SignDocument>("/documents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDocumentApi(
  id: string,
  payload: {
    title: string;
    documentType: string;
    contentHtml: string;
    notes?: string;
    includeCompanySignature?: boolean;
  },
) {
  return api<SignDocument>(`/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteDocumentApi(id: string) {
  return api<{ ok: boolean }>(`/documents/${id}`, { method: "DELETE" });
}

export function hrSignDocumentApi(id: string, signatureName: string) {
  return api<SignDocument>(`/documents/${id}/hr-sign`, {
    method: "POST",
    body: JSON.stringify({ signatureName }),
  });
}

export interface EmployeeDirectoryItem {
  id: string;
  empId: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  departmentCode: number | null;
  companyCode: string;
  companyName: string;
}

export interface DepartmentItem {
  code: number;
  name: string;
}

export interface CompanyItem {
  code: string;
  name: string;
}

export function fetchEmployees() {
  return api<{
    employees: EmployeeDirectoryItem[];
    departments: DepartmentItem[];
    companies: CompanyItem[];
  }>("/employees");
}

export function fetchDocumentTypes(activeOnly = false) {
  const query = activeOnly ? "?activeOnly=1" : "";
  return api<DocumentTypeDefinition[]>(`/document-types${query}`);
}

export function createDocumentTypeApi(payload: {
  name: string;
  description?: string;
  defaultTitle?: string;
  defaultContentHtml?: string;
  active?: boolean;
}) {
  return api<DocumentTypeDefinition>("/document-types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDocumentTypeApi(
  id: string,
  payload: {
    name?: string;
    description?: string;
    defaultTitle?: string;
    defaultContentHtml?: string;
    active?: boolean;
  },
) {
  return api<DocumentTypeDefinition>(`/document-types/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteDocumentTypeApi(id: string) {
  return api<{ ok: boolean }>(`/document-types/${id}`, { method: "DELETE" });
}

export function sendDocumentApi(
  id: string,
  payload: {
    mode: "all" | "selected" | "department" | "company" | "steps";
    recipients?: Array<{
      name: string;
      email: string;
      signingStep?: number;
      stepLabel?: string;
      stepRequireAll?: boolean;
    }>;
    steps?: Array<{
      label: string;
      requireAll?: boolean;
      recipients: Array<{ name: string; email: string }>;
    }>;
    departmentCodes?: number[];
    companyCodes?: string[];
    emailSubject?: string;
    emailBody?: string;
    signingMode?: "sequential" | "parallel";
  },
) {
  return api<
    SignDocument & {
      mailedCount?: number;
      mailFailures?: Array<{ email: string; error: string }>;
      mailError?: string;
      message?: string;
      privateCopyCount?: number;
      privateCopies?: SignDocument[];
    }
  >(`/documents/${id}/send`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function remindRecipientApi(documentId: string, recipientId: string) {
  return api<{
    ok: boolean;
    mailError?: string;
    document: SignDocument;
  }>(`/documents/${documentId}/remind/${recipientId}`, {
    method: "POST",
  });
}

export function fetchSignRequest(token: string) {
  return api<{
    token: string;
    recipient: {
      id: string;
      name: string;
      email: string;
      status: "pending" | "signed" | "declined";
      signingOrder?: number;
      signingStep?: number;
      stepLabel?: string;
      signedAt?: string;
      signatureName?: string;
      fieldValues?: Record<string, string>;
    };
    document: {
      id: string;
      title: string;
      documentType: string;
      contentHtml: string;
      status: string;
      signingMode?: "sequential" | "parallel";
      createdByName: string;
      createdByEmail: string;
      includeCompanySignature?: boolean;
      hrSignature?: {
        name: string;
        email: string;
        signedAt: string;
        role: "hr" | "employee";
      };
      completedAt?: string;
      createdAt: string;
      recipients?: Array<{
        id: string;
        name: string;
        email: string;
        status: "pending" | "signed" | "declined";
        signingOrder?: number;
        signingStep?: number;
        stepLabel?: string;
        signedAt?: string;
        signatureName?: string;
        fieldValues?: Record<string, string>;
      }>;
    };
  }>(`/sign/${token}`);
}

export function confirmSignApi(
  token: string,
  signatureName: string,
  fieldValues?: Record<string, string>,
) {
  return api<{
    ok: boolean;
    status: string;
    recipient: {
      id: string;
      name: string;
      email: string;
      status: string;
      signedAt?: string;
      signatureName?: string;
      fieldValues?: Record<string, string>;
    };
  }>(`/sign/${token}/confirm`, {
    method: "POST",
    body: JSON.stringify({ signatureName, fieldValues: fieldValues || {} }),
  });
}
