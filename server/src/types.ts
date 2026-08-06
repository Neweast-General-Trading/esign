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

export interface Recipient {
  id: string;
  name: string;
  email: string;
  token: string;
  status: "pending" | "signed" | "declined";
  signedAt?: string;
  signatureName?: string;
  sentAt?: string;
  viewedAt?: string;
}

export interface SignDocument {
  id: string;
  title: string;
  documentType: string;
  contentHtml: string;
  status: DocumentStatus;
  createdByEmail: string;
  createdByName: string;
  hrSignature?: SignatureRecord;
  recipients: Recipient[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
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
