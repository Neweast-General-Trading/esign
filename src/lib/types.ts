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

export interface RecipientPublic {
  id: string;
  name: string;
  email: string;
  status: "pending" | "signed" | "declined";
  signingOrder?: number;
  /** Workflow step — several people can share one step (e.g. all employees) */
  signingStep?: number;
  stepLabel?: string;
  /**
   * When true (default), every person in this step must sign before the next step starts.
   * When false, the first signature in the step unlocks the next step.
   */
  stepRequireAll?: boolean;
  signedAt?: string;
  signatureName?: string;
  sentAt?: string;
  viewedAt?: string;
  signToken?: string;
  signUrl?: string;
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
  signingMode?: SigningMode;
  /** When true, document includes a company/HR signature block. Default false (e.g. NDA = employee only). */
  includeCompanySignature?: boolean;
  hrSignature?: SignatureRecord;
  recipients: RecipientPublic[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  parentDocumentId?: string;
  counterpartName?: string;
}

export interface DocumentTypeDefinition {
  id: string;
  name: string;
  description?: string;
  defaultTitle?: string;
  defaultContentHtml?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface AuthUser {
  email: string;
  name: string;
  role?: string;
  authSource?: "intranet" | "microsoft" | "open";
}

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  hr_signed: "HR Signed",
  sent: "Awaiting Signatures",
  partially_signed: "Partially Signed",
  completed: "Completed",
  cancelled: "Cancelled",
};
