import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { signAppToken } from "./auth.js";
import { requireAuth } from "./auth-middleware.js";
import {
  buildDashboardSummary,
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentByRecipientToken,
  listDocuments,
  mergeRecipientsForSend,
  recomputeStatus,
  saveDocument,
  updateDocument,
} from "./documents-store.js";
import {
  sendCompletedCopyEmail,
  sendSignRequestEmail,
  verifySmtp,
} from "./mailer.js";
import {
  listEmployeesAndDepartments,
  resolveEmployeesForSend,
} from "./employees.js";
import type { Recipient, SignDocument } from "./types.js";
import {
  createDocumentType,
  deleteDocumentType,
  listDocumentTypes,
  updateDocumentType,
} from "./document-types-store.js";
import {
  authenticateLocalUser,
  findUserByEmail,
  upsertMicrosoftUser,
} from "./users-store.js";
import {
  buildLoginErrorRedirect,
  buildMicrosoftLoginUrl,
  completeMicrosoftLogin,
  sanitizeReturnTo,
} from "./microsoft-oauth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4038);
const CLIENT_URL = (
  process.env.CLIENT_URL || `http://127.0.0.1:${PORT}`
).replace(/\/$/, "");
const staticDir = path.resolve(__dirname, "../../dist");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

function clientIp(req: express.Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim();
  }
  return req.socket.remoteAddress || undefined;
}

function headerValue(req: express.Request, name: string) {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.split(",")[0]?.trim() ?? "" : "";
}

/**
 * Sign / email links must always use the stable public domain.
 * Building from request Host/prefix can create fragile or duplicate paths
 * that break after a resend or when opened from another host.
 */
function publicSignBaseUrl() {
  return CLIENT_URL;
}

function publicClientUrl(req: express.Request) {
  const host = headerValue(req, "x-forwarded-host") || headerValue(req, "host");
  if (!host || host.startsWith("127.0.0.1") || host.startsWith("localhost")) {
    return CLIENT_URL;
  }
  const proto = headerValue(req, "x-forwarded-proto") || "https";
  const prefix = headerValue(req, "x-forwarded-prefix").replace(/\/$/, "");
  return `${proto}://${host}${prefix}`;
}

function publicDoc(doc: SignDocument, options?: { includeSignLinks?: boolean; baseUrl?: string }) {
  return {
    ...doc,
    recipients: doc.recipients.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      status: r.status,
      signedAt: r.signedAt,
      signatureName: r.signatureName,
      sentAt: r.sentAt,
      viewedAt: r.viewedAt,
      ...(options?.includeSignLinks
        ? {
            signToken: r.token,
            signUrl: `${options.baseUrl || CLIENT_URL}/sign/${r.token}`,
          }
        : {}),
    })),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "e-sign" });
});

app.get("/api/mail/status", async (_req, res) => {
  const result = await verifySmtp();
  res.json({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    enabled: process.env.MAIL_ENABLED !== "false",
    testOverride: (process.env.MAIL_TEST_OVERRIDE || "").trim() || null,
    ...result,
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const openLogin =
    process.env.OPEN_LOGIN === "true" || process.env.ALLOW_DEV_LOGIN === "true";

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "A valid work email is required" });
  }

  // Temporary open access until Azure auth is enabled.
  if (openLogin && !password) {
    const nameFromBody = String(req.body?.name ?? "").trim();
    const local = findUserByEmail(email);
    const name =
      nameFromBody ||
      local?.name ||
      email
        .split("@")[0]
        ?.replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) ||
      "HR User";
    const user = { email, name, role: local?.role || "hr" };
    const token = signAppToken(user);
    return res.json({ token, user });
  }

  if (!password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const user = authenticateLocalUser(email, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = signAppToken(user);
  return res.json({ token, user });
});

app.post("/api/auth/dev-login", (req, res) => {
  if (process.env.ALLOW_DEV_LOGIN !== "true") {
    return res.status(403).json({ error: "Dev login is disabled" });
  }

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const name = String(req.body?.name ?? "").trim();
  if (!email || !name) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  const user = { email, name };
  const token = signAppToken(user);
  return res.json({ token, user });
});

app.get("/api/auth/microsoft/login", (req, res) => {
  const returnTo = sanitizeReturnTo(String(req.query.returnTo ?? CLIENT_URL));
  const silent = String(req.query.silent ?? "") === "1";
  const loginHint = String(req.query.login_hint ?? "").trim();
  return res.redirect(buildMicrosoftLoginUrl(returnTo, { silent, loginHint }));
});

app.get("/api/auth/microsoft/callback", async (req, res) => {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  const error = String(req.query.error_description || req.query.error || "");
  if (error) {
    return res.redirect(buildLoginErrorRedirect(error, CLIENT_URL));
  }
  try {
    const { profile, returnTo } = await completeMicrosoftLogin(code, state);
    if (!profile.email.toLowerCase().endsWith("@neweast.co") &&
        !profile.email.toLowerCase().endsWith("@neweast.com")) {
      return res.redirect(
        buildLoginErrorRedirect("Only NEWEAST Microsoft accounts can access E-Sign", returnTo),
      );
    }
    const user = upsertMicrosoftUser(profile);
    const token = signAppToken(user);
    const target = new URL(returnTo);
    target.hash = new URLSearchParams({
      token,
      email: user.email,
      name: user.name,
    }).toString();
    return res.redirect(target.toString());
  } catch (err) {
    return res.redirect(
      buildLoginErrorRedirect(
        err instanceof Error ? err.message : "Microsoft login failed",
        CLIENT_URL,
      ),
    );
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/dashboard/summary", requireAuth, (_req, res) => {
  // Shared HR portal: every authenticated user sees the full workspace
  const docs = listDocuments();
  res.json(buildDashboardSummary(docs));
});

app.get("/api/employees", requireAuth, async (_req, res) => {
  try {
    const data = await listEmployeesAndDepartments();
    res.json(data);
  } catch (error) {
    console.error("Failed to load employees:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load employees",
    });
  }
});

app.get("/api/document-types", requireAuth, (req, res) => {
  const activeOnly = String(req.query.activeOnly ?? "") === "1";
  res.json(listDocumentTypes({ activeOnly }));
});

app.post("/api/document-types", requireAuth, (req, res) => {
  try {
    const created = createDocumentType({
      name: String(req.body?.name ?? ""),
      description: String(req.body?.description ?? ""),
      defaultTitle: String(req.body?.defaultTitle ?? ""),
      defaultContentHtml: String(req.body?.defaultContentHtml ?? ""),
      active: req.body?.active !== false,
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create document type",
    });
  }
});

app.put("/api/document-types/:id", requireAuth, (req, res) => {
  try {
    const updated = updateDocumentType(req.params.id, {
      name: req.body?.name !== undefined ? String(req.body.name) : undefined,
      description:
        req.body?.description !== undefined ? String(req.body.description) : undefined,
      defaultTitle:
        req.body?.defaultTitle !== undefined ? String(req.body.defaultTitle) : undefined,
      defaultContentHtml:
        req.body?.defaultContentHtml !== undefined
          ? String(req.body.defaultContentHtml)
          : undefined,
      active: req.body?.active,
    });
    if (!updated) return res.status(404).json({ error: "Document type not found" });
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update document type",
    });
  }
});

app.delete("/api/document-types/:id", requireAuth, (req, res) => {
  const ok = deleteDocumentType(req.params.id);
  if (!ok) return res.status(404).json({ error: "Document type not found" });
  return res.json({ ok: true });
});

app.get("/api/documents", requireAuth, (_req, res) => {
  const baseUrl = publicSignBaseUrl();
  const docs = listDocuments().map((doc) =>
    publicDoc(doc, { includeSignLinks: true, baseUrl }),
  );
  res.json(docs);
});

app.get("/api/documents/:id", requireAuth, (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }
  return res.json(
    publicDoc(doc, { includeSignLinks: true, baseUrl: publicSignBaseUrl() }),
  );
});

app.post("/api/documents", requireAuth, (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const documentType = String(req.body?.documentType ?? "NDA").trim() || "NDA";
  const contentHtml = String(req.body?.contentHtml ?? "").trim();
  const notes = String(req.body?.notes ?? "").trim();

  if (!title || !contentHtml) {
    return res.status(400).json({ error: "Title and content are required" });
  }

  const doc = createDocument({
    title,
    documentType,
    contentHtml,
    notes,
    createdByEmail: req.user!.email,
    createdByName: req.user!.name,
  });

  return res.status(201).json(publicDoc(doc));
});

app.put("/api/documents/:id", requireAuth, (req, res) => {
  const existing = getDocument(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Document not found" });
  }
  if (existing.status !== "draft") {
    return res.status(400).json({ error: "Only draft documents can be edited" });
  }

  const updated = updateDocument(existing.id, {
    title: String(req.body?.title ?? existing.title).trim(),
    documentType: String(req.body?.documentType ?? existing.documentType).trim() || existing.documentType,
    contentHtml: String(req.body?.contentHtml ?? existing.contentHtml),
    notes: String(req.body?.notes ?? existing.notes ?? "").trim() || undefined,
  });

  return res.json(publicDoc(updated!, { includeSignLinks: true, baseUrl: publicClientUrl(req) }));
});

app.delete("/api/documents/:id", requireAuth, (req, res) => {
  const existing = getDocument(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Document not found" });
  }
  deleteDocument(existing.id);
  return res.json({ ok: true });
});

app.post("/api/documents/:id/hr-sign", requireAuth, (req, res) => {
  const existing = getDocument(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Document not found" });
  }
  if (existing.status !== "draft") {
    return res.status(400).json({ error: "Document is already signed by HR" });
  }

  const signatureName = String(req.body?.signatureName ?? req.user!.name).trim();
  if (!signatureName) {
    return res.status(400).json({ error: "Signature name is required" });
  }

  const updated = updateDocument(existing.id, {
    status: "hr_signed",
    hrSignature: {
      name: signatureName,
      email: req.user!.email,
      signedAt: new Date().toISOString(),
      role: "hr",
      ipAddress: clientIp(req),
    },
  });

  return res.json(publicDoc(updated!, { includeSignLinks: true, baseUrl: publicClientUrl(req) }));
});

app.post("/api/documents/:id/send", requireAuth, async (req, res) => {
  const existing = getDocument(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Document not found" });
  }
  if (existing.status !== "hr_signed" && existing.status !== "sent" && existing.status !== "partially_signed") {
    return res.status(400).json({ error: "HR must approve and sign the document before sending" });
  }

  const modeRaw = String(req.body?.mode ?? "selected").trim().toLowerCase();
  const mode =
    modeRaw === "all" ||
    modeRaw === "department" ||
    modeRaw === "company" ||
    modeRaw === "selected"
      ? modeRaw
      : "selected";
  const subjectTemplate = String(req.body?.emailSubject ?? "").trim();
  const bodyTemplate = String(req.body?.emailBody ?? "").trim();
  const departmentCodes = Array.isArray(req.body?.departmentCodes)
    ? req.body.departmentCodes.map((code: unknown) => Number(code)).filter((code: number) => !Number.isNaN(code))
    : [];
  const companyCodes = Array.isArray(req.body?.companyCodes)
    ? req.body.companyCodes.map((code: unknown) => String(code).trim()).filter(Boolean)
    : [];

  let resolvedPeople: Array<{
    name: string;
    email: string;
    designation?: string;
    department?: string;
    companyName?: string;
  }> = [];

  try {
    if (mode === "all" || mode === "department" || mode === "company") {
      const employees = await resolveEmployeesForSend({
        mode,
        departmentCodes,
        companyCodes,
      });
      resolvedPeople = employees.map((emp) => ({
        name: emp.name,
        email: emp.email,
        designation: emp.designation,
        department: emp.department,
        companyName: emp.companyName,
      }));
    } else {
      const incoming = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
      if (incoming.length) {
        const directory = await listEmployeesAndDepartments().catch(() => ({
          employees: [] as Array<{
            email: string;
            name: string;
            designation: string;
            department: string;
            companyName: string;
          }>,
        }));
        const byEmail = new Map(
          directory.employees.map((emp) => [emp.email.toLowerCase(), emp] as const),
        );

        resolvedPeople = incoming
          .map((item: { name?: string; email?: string }) => {
            const email = String(item.email ?? "").trim().toLowerCase();
            const fromDir = byEmail.get(email);
            return {
              name: String(item.name ?? fromDir?.name ?? "").trim() || email,
              email,
              designation: fromDir?.designation,
              department: fromDir?.department,
              companyName: fromDir?.companyName,
            };
          })
          .filter((item: { name: string; email: string }) => item.name && item.email.includes("@"));
      } else if (existing.recipients.length) {
        resolvedPeople = existing.recipients.map((r) => ({
          name: r.name,
          email: r.email,
        }));
      }
    }
  } catch (error) {
    console.error("Failed resolving recipients:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to resolve employees",
    });
  }

  if (!resolvedPeople.length) {
    return res.status(400).json({ error: "At least one recipient is required" });
  }

  const now = new Date().toISOString();
  const recipients = mergeRecipientsForSend(existing.recipients, resolvedPeople, now);

  const draft: SignDocument = {
    ...existing,
    recipients,
    status: "sent",
    updatedAt: now,
  };
  draft.status = recomputeStatus({ ...draft, status: "sent" });
  const saved = saveDocument(draft)!;

  const metaByEmail = new Map(
    resolvedPeople.map((person) => [person.email.toLowerCase(), person] as const),
  );
  const baseUrl = publicSignBaseUrl();

  const mailFailures: Array<{ email: string; error: string }> = [];
  const pendingToMail = saved.recipients.filter((r) => {
    if (r.status !== "pending") return false;
    // Only mail people included in this send batch
    return metaByEmail.has(r.email.toLowerCase());
  });

  for (const recipient of pendingToMail) {
    const signUrl = `${baseUrl}/sign/${recipient.token}`;
    const meta = metaByEmail.get(recipient.email.toLowerCase());
    const result = await sendSignRequestEmail({
      to: recipient.email,
      recipientName: recipient.name,
      designation: meta?.designation,
      department: meta?.department,
      companyName: meta?.companyName,
      documentTitle: saved.title,
      documentType: saved.documentType,
      hrName: saved.createdByName,
      signUrl,
      subjectTemplate: subjectTemplate || undefined,
      bodyTemplate: bodyTemplate || undefined,
    });
    if (!result.ok) {
      mailFailures.push({ email: recipient.email, error: result.error || "Unknown mail error" });
    }
  }

  return res.json({
    ...publicDoc(saved, { includeSignLinks: true, baseUrl }),
    mailFailures,
    mailError: mailFailures.length
      ? `Email delivery failed for ${mailFailures.length} of ${pendingToMail.length} recipient(s): ${mailFailures[0]!.error}`
      : undefined,
  });
});

app.post("/api/documents/:id/remind/:recipientId", requireAuth, async (req, res) => {
  const existing = getDocument(req.params.id);
  if (!existing) return res.status(404).json({ error: "Document not found" });

  const recipient = existing.recipients.find((r) => r.id === req.params.recipientId);
  if (!recipient) return res.status(404).json({ error: "Recipient not found" });
  if (recipient.status === "signed") {
    return res.status(400).json({ error: "Recipient has already signed" });
  }

  const baseUrl = publicSignBaseUrl();
  const signUrl = `${baseUrl}/sign/${recipient.token}`;
  const result = await sendSignRequestEmail({
    to: recipient.email,
    recipientName: recipient.name,
    documentTitle: existing.title,
    documentType: existing.documentType,
    hrName: existing.createdByName,
    signUrl,
  });

  recipient.sentAt = new Date().toISOString();
  saveDocument(existing);

  return res.json({
    ok: result.ok,
    mailError: result.ok ? undefined : result.error,
    document: publicDoc(existing, { includeSignLinks: true, baseUrl }),
  });
});

app.get("/api/sign/:token", (req, res) => {
  const found = getDocumentByRecipientToken(req.params.token);
  if (!found) {
    return res.status(404).json({ error: "Sign link is invalid or expired" });
  }

  const { document, recipient } = found;
  if (!recipient.viewedAt) {
    recipient.viewedAt = new Date().toISOString();
    saveDocument(document);
  }

  return res.json({
    token: recipient.token,
    recipient: {
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      status: recipient.status,
      signedAt: recipient.signedAt,
      signatureName: recipient.signatureName,
    },
    document: {
      id: document.id,
      title: document.title,
      documentType: document.documentType,
      contentHtml: document.contentHtml,
      status: document.status,
      createdByName: document.createdByName,
      createdByEmail: document.createdByEmail,
      hrSignature: document.hrSignature,
      completedAt: document.completedAt,
      createdAt: document.createdAt,
    },
  });
});

app.post("/api/sign/:token/confirm", async (req, res) => {
  const found = getDocumentByRecipientToken(req.params.token);
  if (!found) {
    return res.status(404).json({ error: "Sign link is invalid or expired" });
  }

  const { document, recipient } = found;
  if (recipient.status === "signed") {
    return res.status(400).json({ error: "This document is already signed" });
  }
  if (document.status === "cancelled") {
    return res.status(400).json({ error: "This document was cancelled" });
  }

  const signatureName = String(req.body?.signatureName ?? recipient.name).trim();
  if (!signatureName) {
    return res.status(400).json({ error: "Signature name is required" });
  }

  recipient.status = "signed";
  recipient.signedAt = new Date().toISOString();
  recipient.signatureName = signatureName;

  document.status = recomputeStatus({ ...document, status: "sent" });
  if (document.status === "completed") {
    document.completedAt = new Date().toISOString();
  }
  const saved = saveDocument(document)!;

  if (saved.status === "completed") {
    const parties = [
      `${saved.hrSignature?.name || saved.createdByName} (HR)`,
      ...saved.recipients
        .filter((r) => r.status === "signed")
        .map((r) => `${r.signatureName || r.name} (Employee)`),
    ];

    const baseUrl = publicSignBaseUrl();
    await sendCompletedCopyEmail({
      to: saved.createdByEmail,
      recipientName: saved.createdByName,
      documentTitle: saved.title,
      documentType: saved.documentType,
      viewUrl: `${baseUrl}/?doc=${saved.id}`,
      parties,
    });

    for (const r of saved.recipients.filter((item) => item.status === "signed")) {
      await sendCompletedCopyEmail({
        to: r.email,
        recipientName: r.name,
        documentTitle: saved.title,
        documentType: saved.documentType,
        viewUrl: `${baseUrl}/sign/${r.token}`,
        parties,
      });
    }
  }

  return res.json({
    ok: true,
    status: saved.status,
    recipient: {
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      status: recipient.status,
      signedAt: recipient.signedAt,
      signatureName: recipient.signatureName,
    },
  });
});

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(staticDir, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`E-Sign listening on http://0.0.0.0:${PORT}`);
  console.log(`Public client URL: ${CLIENT_URL}`);
});
