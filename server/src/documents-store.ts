import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DashboardSummary, Recipient, SignDocument } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const dataFile = path.join(dataDir, "documents.json");

function ensureStore() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    writeFileSync(dataFile, "[]", "utf8");
  }
}

function readAll(): SignDocument[] {
  ensureStore();
  const raw = readFileSync(dataFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as SignDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(docs: SignDocument[]) {
  ensureStore();
  writeFileSync(dataFile, JSON.stringify(docs, null, 2), "utf8");
}

export function listDocuments(ownerEmail?: string) {
  const docs = readAll();
  if (!ownerEmail) return docs;
  const email = ownerEmail.trim().toLowerCase();
  return docs.filter((doc) => doc.createdByEmail.toLowerCase() === email);
}

export function getDocument(id: string) {
  return readAll().find((doc) => doc.id === id) ?? null;
}

export function getDocumentByRecipientToken(token: string) {
  const docs = readAll();
  for (const doc of docs) {
    const recipient = doc.recipients.find((item) => item.token === token);
    if (recipient) return { document: doc, recipient };
  }
  return null;
}

export function createDocument(input: {
  title: string;
  documentType: string;
  contentHtml: string;
  notes?: string;
  createdByEmail: string;
  createdByName: string;
}) {
  const now = new Date().toISOString();
  const doc: SignDocument = {
    id: randomUUID(),
    title: input.title.trim(),
    documentType: input.documentType,
    contentHtml: input.contentHtml,
    status: "draft",
    createdByEmail: input.createdByEmail.trim().toLowerCase(),
    createdByName: input.createdByName.trim(),
    recipients: [],
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const docs = readAll();
  docs.unshift(doc);
  writeAll(docs);
  return doc;
}

export function updateDocument(id: string, patch: Partial<SignDocument>) {
  const docs = readAll();
  const index = docs.findIndex((doc) => doc.id === id);
  if (index < 0) return null;
  docs[index] = {
    ...docs[index],
    ...patch,
    id: docs[index].id,
    updatedAt: new Date().toISOString(),
  };
  writeAll(docs);
  return docs[index];
}

export function deleteDocument(id: string) {
  const docs = readAll();
  const next = docs.filter((doc) => doc.id !== id);
  if (next.length === docs.length) return false;
  writeAll(next);
  return true;
}

export function recomputeStatus(doc: SignDocument): SignDocument["status"] {
  if (doc.status === "cancelled" || doc.status === "draft" || doc.status === "hr_signed") {
    return doc.status;
  }
  if (!doc.recipients.length) return "hr_signed";
  const signed = doc.recipients.filter((r) => r.status === "signed").length;
  if (signed === 0) return "sent";
  if (signed < doc.recipients.length) return "partially_signed";
  return "completed";
}

export function saveDocument(doc: SignDocument) {
  return updateDocument(doc.id, doc);
}

export function buildDashboardSummary(docs: SignDocument[]): DashboardSummary {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  const signedThisMonth = docs.filter((doc) => {
    if (doc.status !== "completed" || !doc.completedAt) return false;
    const completed = new Date(doc.completedAt);
    return completed.getMonth() === month && completed.getFullYear() === year;
  }).length;

  const allRecipients = docs.flatMap((doc) => doc.recipients);
  const pendingRecipients = allRecipients.filter((r) => r.status === "pending").length;
  const signedRecipients = allRecipients.filter((r) => r.status === "signed").length;
  const completionRate =
    allRecipients.length > 0
      ? Math.round((signedRecipients / allRecipients.length) * 100)
      : docs.filter((d) => d.status === "completed").length && docs.length
        ? Math.round(
            (docs.filter((d) => d.status === "completed").length / docs.length) * 100,
          )
        : 0;

  const typeMap = new Map<string, { count: number; completed: number }>();
  for (const doc of docs) {
    const key = doc.documentType || "Other";
    const entry = typeMap.get(key) ?? { count: 0, completed: 0 };
    entry.count += 1;
    if (doc.status === "completed") entry.completed += 1;
    typeMap.set(key, entry);
  }

  const awaitingDocs = docs.filter(
    (d) => d.status === "sent" || d.status === "partially_signed",
  );

  const overdueAwaiting = awaitingDocs.filter((doc) => {
    const sentTimes = doc.recipients
      .map((r) => (r.sentAt ? new Date(r.sentAt).getTime() : 0))
      .filter(Boolean);
    const earliest = sentTimes.length ? Math.min(...sentTimes) : new Date(doc.updatedAt).getTime();
    return now.getTime() - earliest > threeDaysMs;
  }).length;

  const recentActivity = [...docs]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      documentType: doc.documentType,
      updatedAt: doc.updatedAt,
      signedCount: doc.recipients.filter((r) => r.status === "signed").length,
      recipientCount: doc.recipients.length,
      createdByName: doc.createdByName,
    }));

  const topAwaiting = awaitingDocs
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      documentType: doc.documentType,
      pendingCount: doc.recipients.filter((r) => r.status === "pending").length,
      recipientCount: doc.recipients.length,
      updatedAt: doc.updatedAt,
    }))
    .sort((a, b) => b.pendingCount - a.pendingCount)
    .slice(0, 8);

  return {
    total: docs.length,
    draft: docs.filter((d) => d.status === "draft").length,
    hrSigned: docs.filter((d) => d.status === "hr_signed").length,
    sent: docs.filter((d) => d.status === "sent").length,
    partiallySigned: docs.filter((d) => d.status === "partially_signed").length,
    completed: docs.filter((d) => d.status === "completed").length,
    cancelled: docs.filter((d) => d.status === "cancelled").length,
    awaitingSignatures: awaitingDocs.length,
    signedThisMonth,
    pendingRecipients,
    signedRecipients,
    completionRate,
    overdueAwaiting,
    byDocumentType: [...typeMap.entries()]
      .map(([type, value]) => ({ type, ...value }))
      .sort((a, b) => b.count - a.count),
    recentActivity,
    topAwaiting,
  };
}

export function makeRecipient(name: string, email: string): Recipient {
  // 64-char unique token per recipient — never reused across people.
  return {
    id: randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    token: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
    status: "pending",
  };
}

/**
 * Merge a new send list with existing recipients so previously emailed
 * sign links stay valid. Signed people are always preserved.
 */
export function mergeRecipientsForSend(
  existing: Recipient[],
  incoming: Array<{ name: string; email: string }>,
  now = new Date().toISOString(),
): Recipient[] {
  const byEmail = new Map(
    existing.map((r) => [r.email.trim().toLowerCase(), r] as const),
  );
  const usedTokens = new Set(existing.map((r) => r.token));
  const next: Recipient[] = [];

  for (const person of incoming) {
    const email = person.email.trim().toLowerCase();
    const prev = byEmail.get(email);
    if (prev) {
      if (prev.status === "signed") {
        next.push(prev);
      } else {
        next.push({
          ...prev,
          name: person.name.trim() || prev.name,
          email,
          status: "pending",
          sentAt: now,
          viewedAt: undefined,
        });
      }
      byEmail.delete(email);
      continue;
    }

    let created = makeRecipient(person.name, email);
    while (usedTokens.has(created.token)) {
      created = makeRecipient(person.name, email);
    }
    usedTokens.add(created.token);
    next.push({
      ...created,
      sentAt: now,
      status: "pending",
    });
  }

  // Keep previously signed recipients even if they were not in this send batch
  for (const leftover of byEmail.values()) {
    if (leftover.status === "signed") next.push(leftover);
  }

  return next;
}
