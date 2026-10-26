export type DocumentStatus =
  | "draft"
  | "hr_signed"
  | "sent"
  | "partially_signed"
  | "completed"
  | "cancelled";

export interface SignatureRecord {
  name: string;
  email: string;
  signedAt: string;
  role: "hr" | "employee";
  ipAddress?: string;
}

export type SigningMode = "sequential" | "parallel";

export interface Recipient {
  id: string;
  name: string;
  email: string;
  token: string;
  status: "pending" | "signed" | "declined";
  /** 1-based document field number (Signatory #N) — unique per person */
  signingOrder: number;
  /** 1-based workflow step — multiple people can share the same step */
  signingStep?: number;
  /** Display label for the step (e.g. Employees, Manager) */
  stepLabel?: string;
  /**
   * When true/undefined: everyone in the step must sign before the next step.
   * When false: first signature in the step unlocks the next step.
   */
  stepRequireAll?: boolean;
  signedAt?: string;
  signatureName?: string;
  sentAt?: string;
  viewedAt?: string;
  /** Values filled by this signatory into document input fields */
  fieldValues?: Record<string, string>;
}

export interface SignDocument {
  id: string;
  title: string;
  documentType: string;
  contentHtml: string;
  status: DocumentStatus;
  createdByEmail: string;
  createdByName: string;
  /** sequential = next person is emailed only after previous signs */
  signingMode?: SigningMode;
  /** When true, company/HR signature is part of the document. Default false. */
  includeCompanySignature?: boolean;
  hrSignature?: SignatureRecord;
  recipients: Recipient[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  /** When a multi-employee send is split into private copies */
  parentDocumentId?: string;
  counterpartName?: string;
}

export interface DashboardSummary {
  total: number;
  draft: number;
  hrSigned: number;
  sent: number;
  partiallySigned: number;
  completed: number;
  cancelled: number;
  awaitingSignatures: number;
  signedThisMonth: number;
  pendingRecipients: number;
  signedRecipients: number;
  completionRate: number;
  overdueAwaiting: number;
  byDocumentType: Array<{ type: string; count: number; completed: number }>;
  recentActivity: Array<{
    id: string;
    title: string;
    status: DocumentStatus;
    documentType: string;
    updatedAt: string;
    signedCount: number;
    recipientCount: number;
    createdByName: string;
  }>;
  topAwaiting: Array<{
    id: string;
    title: string;
    documentType: string;
    pendingCount: number;
    recipientCount: number;
    updatedAt: string;
  }>;
}
