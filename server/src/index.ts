import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { signAppToken, exchangeSharedAppToken } from "./auth.js";
import { requireAuth } from "./auth-middleware.js";
import {
  buildDashboardSummary,
  canRecipientActNow,
  createDocument,
  createPrivateSigningCopy,
  deleteDocument,
  getCurrentStep,
  getPendingInCurrentStep,
  getDocument,
  getDocumentByRecipientToken,
  getRecipientStep,
  isRecipientSuperseded,
  listDocuments,
  makeRecipient,
  mergeRecipientsForSend,
  recomputeStatus,
  saveDocument,
  sortRecipientsByOrder,
  updateDocument,
} from "./documents-store.js";
import {
  getMailBccList,
  sendCompletedCopyEmail,
  sendSignRequestEmail,
  sendThankYouForSigningEmail,
  verifySmtp,
} from "./mailer.js";
import { compactSignerOrdersInHtml } from "./signer-order.js";
import {
  listEmployeesAndDepartments,
  resolveEmployeesForSend,
} from "./employees.js";
import type { SignDocument, SigningMode } from "./types.js";
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
import { verifyIntranetLinkOtp } from "./bi-users.js";
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
app.use(express.json({ limit: "20mb" }));

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
  const ordered = sortRecipientsByOrder(doc.recipients);
  return {
    ...doc,
    signingMode: doc.signingMode || "parallel",
    includeCompanySignature: Boolean(doc.includeCompanySignature),
    recipients: ordered.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      status: r.status,
      signingOrder: r.signingOrder || 0,
      signingStep: r.signingStep || r.signingOrder || 0,
      stepLabel: r.stepLabel,
      stepRequireAll: r.stepRequireAll !== false,
      signedAt: r.signedAt,
      signatureName: r.signatureName,
      sentAt: r.sentAt,
      viewedAt: r.viewedAt,
      fieldValues: r.fieldValues || {},
      ...(options?.includeSignLinks
        ? {
            signToken: r.token,
            signUrl: `${options.baseUrl || CLIENT_URL}/sign/${r.token}`,
          }
        : {}),
    })),
  };
}

async function emailSignRequestForRecipient(
  doc: SignDocument,
  recipient: SignDocument["recipients"][number],
  extras?: {
    designation?: string;
    department?: string;
    companyName?: string;
    subjectTemplate?: string;
    bodyTemplate?: string;
  },
) {
  const baseUrl = publicSignBaseUrl();
  const signUrl = `${baseUrl}/sign/${recipient.token}`;
  return sendSignRequestEmail({
    to: recipient.email,
    recipientName: recipient.name,
    designation: extras?.designation,
    department: extras?.department,
    companyName: extras?.companyName,
    documentTitle: doc.title,
    documentType: doc.documentType,
    hrName: doc.createdByName,
    signUrl,
    subjectTemplate: extras?.subjectTemplate,
    bodyTemplate: extras?.bodyTemplate,
  });
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
    bcc: getMailBccList(),
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

  // Temporary open access until Azure auth is fully enforced.
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
    const user = { email, name, role: local?.role || "hr", authSource: "open" as const };
    const token = signAppToken(user, "open");
    return res.json({ token, user });
  }

  if (!password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const user = authenticateLocalUser(email, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = signAppToken({ ...user, authSource: "open" }, "open");
  return res.json({ token, user: { ...user, authSource: "open" } });
});

app.post("/api/auth/sso", (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }
    const result = exchangeSharedAppToken(token);
    return res.json({ success: true, token: result.token, user: result.user });
  } catch (error) {
    return res.status(401).json({
      error: error instanceof Error ? error.message : "SSO exchange failed",
    });
  }
});

app.post("/api/auth/intranet-link", async (req, res) => {
  try {
    const userId =
      typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    const otp =
      req.body?.otp != null && String(req.body.otp).trim()
        ? String(req.body.otp).trim()
        : "";
    const companyCode =
      typeof req.body?.companyCode === "string"
        ? req.body.companyCode.trim()
        : "";

    if (!userId || !otp || !companyCode) {
      return res.status(400).json({
        error: "userId, otp, and companyCode are required",
      });
    }

    const biUser = await verifyIntranetLinkOtp(userId, otp, companyCode);
    if (!biUser) {
      return res.status(401).json({ error: "Invalid Intranet login link" });
    }

    const email = biUser.USER_EMAIL?.trim().toLowerCase();
    if (!email) {
      return res.status(401).json({ error: "User email not found" });
    }

    const user = {
      email,
      name:
        biUser.EMP_FULLNAME?.trim() ||
        biUser.USER_NAME?.trim() ||
        email,
      role: "hr" as const,
      authSource: "intranet" as const,
    };

    return res.json({
      success: true,
      token: signAppToken(user, "intranet"),
      user,
    });
  } catch (error) {
    console.error("Intranet link auth failed:", error);
    return res.status(401).json({
      error: error instanceof Error ? error.message : "Intranet login failed",
    });
  }
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

  const user = { email, name, authSource: "open" as const };
  const token = signAppToken(user, "open");
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
    const user = {
      ...upsertMicrosoftUser(profile),
      authSource: "microsoft" as const,
    };
    const token = signAppToken(user, "microsoft");
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
  const includeCompanySignature = Boolean(req.body?.includeCompanySignature);

  if (!title || !contentHtml) {
    return res.status(400).json({ error: "Title and content are required" });
  }

  const doc = createDocument({
    title,
    documentType,
    contentHtml: compactSignerOrdersInHtml(contentHtml),
    notes,
    includeCompanySignature,
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
    contentHtml: compactSignerOrdersInHtml(
      String(req.body?.contentHtml ?? existing.contentHtml),
    ),
    notes: String(req.body?.notes ?? existing.notes ?? "").trim() || undefined,
    includeCompanySignature:
      req.body?.includeCompanySignature === undefined
        ? Boolean(existing.includeCompanySignature)
        : Boolean(req.body.includeCompanySignature),
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
  // Uploader does not need to be the first signatory — draft can be sent directly.
  if (
    existing.status !== "draft" &&
    existing.status !== "hr_signed" &&
    existing.status !== "sent" &&
    existing.status !== "partially_signed"
  ) {
    return res.status(400).json({
      error: "Document cannot be sent in its current status",
    });
  }

  const modeRaw = String(req.body?.mode ?? "selected").trim().toLowerCase();
  const mode =
    modeRaw === "all" ||
    modeRaw === "department" ||
    modeRaw === "company" ||
    modeRaw === "selected" ||
    modeRaw === "steps"
      ? modeRaw
      : "selected";

  const signingModeRaw = String(req.body?.signingMode ?? "").trim().toLowerCase();
  const signingMode: SigningMode =
    signingModeRaw === "parallel" || signingModeRaw === "sequential"
      ? signingModeRaw
      : mode === "selected" || mode === "steps"
        ? "sequential"
        : "parallel";

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
    signingStep?: number;
    stepLabel?: string;
    stepRequireAll?: boolean;
    designation?: string;
    department?: string;
    companyName?: string;
  }> = [];

  try {
    if (mode === "steps") {
      const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
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

      steps.forEach((step: { label?: string; requireAll?: boolean; recipients?: unknown }, stepIndex: number) => {
        const label = String(step?.label ?? `Step ${stepIndex + 1}`).trim() || `Step ${stepIndex + 1}`;
        const requireAll = step?.requireAll !== false;
        const members = Array.isArray(step?.recipients) ? step.recipients : [];
        members.forEach((item: { name?: string; email?: string }) => {
          const email = String(item.email ?? "").trim().toLowerCase();
          if (!email.includes("@")) return;
          const fromDir = byEmail.get(email);
          resolvedPeople.push({
            name: String(item.name ?? fromDir?.name ?? "").trim() || email,
            email,
            signingStep: stepIndex + 1,
            stepLabel: label,
            stepRequireAll: requireAll,
            designation: fromDir?.designation,
            department: fromDir?.department,
            companyName: fromDir?.companyName,
          });
        });
      });
    } else if (mode === "all" || mode === "department" || mode === "company") {
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
          .map((item: { name?: string; email?: string; signingStep?: number; stepLabel?: string }) => {
            const email = String(item.email ?? "").trim().toLowerCase();
            const fromDir = byEmail.get(email);
            return {
              name: String(item.name ?? fromDir?.name ?? "").trim() || email,
              email,
              signingStep: item.signingStep ? Number(item.signingStep) : undefined,
              stepLabel: item.stepLabel ? String(item.stepLabel) : undefined,
              designation: fromDir?.designation,
              department: fromDir?.department,
              companyName: fromDir?.companyName,
            };
          })
          .filter((item: { name: string; email: string }) => item.name && item.email.includes("@"));
      } else if (existing.recipients.length) {
        resolvedPeople = sortRecipientsByOrder(existing.recipients).map((r) => ({
          name: r.name,
          email: r.email,
          signingStep: r.signingStep || r.signingOrder,
          stepLabel: r.stepLabel,
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
  const baseUrl = publicSignBaseUrl();

  /**
   * One private copy per Step 1 person whenever more than one person is on that
   * level. Later steps (manager) are copied onto each document. Nobody is declined
   * because a colleague signed first.
   */
  const step1People = resolvedPeople.filter((p) => Number(p.signingStep || 1) === 1);
  const laterPeople = resolvedPeople.filter((p) => Number(p.signingStep || 1) > 1);
  const shouldFanOut =
    mode === "steps" &&
    signingMode === "sequential" &&
    step1People.length > 1;

  if (shouldFanOut) {
    const metaByEmail = new Map(
      resolvedPeople.map((person) => [person.email.toLowerCase(), person] as const),
    );
    const createdDocs: SignDocument[] = [];
    const mailFailures: Array<{ email: string; error: string }> = [];
    let mailedCount = 0;

    for (const employee of step1People) {
      const recipients = [
        {
          ...makeRecipient(employee.name, employee.email, 1, 1, employee.stepLabel),
          stepRequireAll: true,
          sentAt: now,
        },
        ...laterPeople.map((person, index) => ({
          ...makeRecipient(
            person.name,
            person.email,
            index + 2,
            Number(person.signingStep || index + 2),
            person.stepLabel,
          ),
          stepRequireAll: true,
        })),
      ];

      const copy = createPrivateSigningCopy(
        existing,
        employee.name,
        recipients,
        signingMode,
      );
      createdDocs.push(copy);
    }

    const mailJobs = createdDocs.flatMap((copy) => {
      const first = copy.recipients.find((r) => getRecipientStep(r) === 1);
      if (!first) return [];
      const meta = metaByEmail.get(first.email.toLowerCase());
      return [{ copy, first, meta }];
    });

    const sendJobs = async () => {
      for (const job of mailJobs) {
        const result = await emailSignRequestForRecipient(job.copy, job.first, {
          designation: job.meta?.designation,
          department: job.meta?.department,
          companyName: job.meta?.companyName,
          subjectTemplate: subjectTemplate || undefined,
          bodyTemplate: bodyTemplate || undefined,
        });
        if (!result.ok) {
          console.error(
            `[e-sign mail] failed ${job.first.email}: ${result.error || "Unknown mail error"}`,
          );
        }
      }
    };

    // Large fan-out (all employees) must not hold the HTTP request open.
    const mailInBackground = mailJobs.length > 25;
    if (!mailInBackground) {
      for (const job of mailJobs) {
        const result = await emailSignRequestForRecipient(job.copy, job.first, {
          designation: job.meta?.designation,
          department: job.meta?.department,
          companyName: job.meta?.companyName,
          subjectTemplate: subjectTemplate || undefined,
          bodyTemplate: bodyTemplate || undefined,
        });
        mailedCount += 1;
        if (!result.ok) {
          mailFailures.push({ email: job.first.email, error: result.error || "Unknown mail error" });
        }
      }
    } else {
      mailedCount = mailJobs.length;
      void sendJobs();
    }

    // Retire the shared template so nobody signs a multi-party leak copy.
    const retired = saveDocument({
      ...existing,
      contentHtml: compactSignerOrdersInHtml(existing.contentHtml),
      status: "cancelled",
      notes: [
        existing.notes,
        `Split into ${createdDocs.length} private signing copies (one employee ↔ manager each).`,
      ]
        .filter(Boolean)
        .join(" "),
      updatedAt: now,
    })!;

    return res.json({
      ...publicDoc(retired, { includeSignLinks: false, baseUrl }),
      privateCopyCount: createdDocs.length,
      // Only the first copy is returned in full so a large send (all employees)
      // does not ship hundreds of HTML bodies back to the browser.
      privateCopies: createdDocs[0]
        ? [publicDoc(createdDocs[0], { includeSignLinks: true, baseUrl })]
        : [],
      mailedCount,
      mailFailures,
      mailError: mailFailures.length
        ? `Email delivery failed for ${mailFailures.length} of ${mailedCount} recipient(s): ${mailFailures[0]!.error}`
        : undefined,
      message: mailInBackground
        ? `Created ${createdDocs.length} private documents. Emails are being sent.`
        : `Created ${createdDocs.length} private documents (one per employee).`,
    });
  }

  const recipients = mergeRecipientsForSend(existing.recipients, resolvedPeople, {
    // Parallel: mark everyone sent. Sequential: current step marked below.
    markAllSentAt: signingMode === "parallel" ? now : null,
  });

  if (signingMode === "sequential") {
    for (const person of getPendingInCurrentStep(recipients)) {
      person.sentAt = now;
    }
  }

  const draft: SignDocument = {
    ...existing,
    contentHtml: compactSignerOrdersInHtml(existing.contentHtml),
    recipients,
    signingMode,
    status: "sent",
    updatedAt: now,
  };
  draft.status = recomputeStatus({ ...draft, status: "sent" });
  const saved = saveDocument(draft)!;

  const metaByEmail = new Map(
    resolvedPeople.map((person) => [person.email.toLowerCase(), person] as const),
  );

  const mailFailures: Array<{ email: string; error: string }> = [];
  const pendingToMail =
    signingMode === "sequential"
      ? getPendingInCurrentStep(saved.recipients)
      : saved.recipients.filter((r) => {
          if (r.status !== "pending") return false;
          return metaByEmail.has(r.email.toLowerCase());
        });

  for (const recipient of pendingToMail) {
    const meta = metaByEmail.get(recipient.email.toLowerCase());
    const result = await emailSignRequestForRecipient(saved, recipient, {
      designation: meta?.designation,
      department: meta?.department,
      companyName: meta?.companyName,
      subjectTemplate: subjectTemplate || undefined,
      bodyTemplate: bodyTemplate || undefined,
    });
    if (!result.ok) {
      mailFailures.push({ email: recipient.email, error: result.error || "Unknown mail error" });
    }
  }

  return res.json({
    ...publicDoc(saved, { includeSignLinks: true, baseUrl }),
    mailedCount: pendingToMail.length,
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
  if (!canRecipientActNow(existing, recipient.id)) {
    return res.status(400).json({
      error: "Sequential signing: this person is not next in the signing order yet",
    });
  }

  const result = await emailSignRequestForRecipient(existing, recipient);

  recipient.sentAt = new Date().toISOString();
  saveDocument(existing);

  return res.json({
    ok: result.ok,
    mailError: result.ok ? undefined : result.error,
    document: publicDoc(existing, { includeSignLinks: true, baseUrl: publicSignBaseUrl() }),
  });
});

app.get("/api/sign/:token", (req, res) => {
  const found = getDocumentByRecipientToken(req.params.token);
  if (!found) {
    return res.status(404).json({ error: "Sign link is invalid or expired" });
  }

  const { document, recipient } = found;

  if (isRecipientSuperseded(document, recipient.id)) {
    return res.status(403).json({
      error:
        "This signing link is no longer valid. Another party already completed a private copy of this agreement. Contact the sender if you still need your own copy to sign.",
      superseded: true,
    });
  }

  if (
    recipient.status !== "signed" &&
    !canRecipientActNow(document, recipient.id)
  ) {
    return res.status(403).json({
      error:
        "It is not your turn to sign yet. You will receive an email when the previous signatory has completed.",
      waitingForTurn: true,
    });
  }

  if (!recipient.viewedAt) {
    recipient.viewedAt = new Date().toISOString();
    saveDocument(document);
  }

  // Privacy: only parties on this signing session. Never expose declined peers
  // or other Step-1 employees from a leaked shared document.
  const viewerStep = getRecipientStep(recipient);
  const visibleRecipients = sortRecipientsByOrder(document.recipients).filter((r) => {
    if (r.status === "declined") return false;
    if (r.id === recipient.id) return true;
    const step = getRecipientStep(r);
    // Never show another person in the same step (peers).
    if (step === viewerStep) return false;
    return true;
  });

  return res.json({
    token: recipient.token,
    recipient: {
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      status: recipient.status,
      signingOrder: recipient.signingOrder,
      signingStep: recipient.signingStep || recipient.signingOrder,
      stepLabel: recipient.stepLabel,
      signedAt: recipient.signedAt,
      signatureName: recipient.signatureName,
      fieldValues: recipient.fieldValues || {},
    },
    document: {
      id: document.id,
      title: document.title,
      documentType: document.documentType,
      contentHtml: document.contentHtml,
      status: document.status,
      signingMode: document.signingMode || "parallel",
      createdByName: document.createdByName,
      createdByEmail: document.createdByEmail,
      includeCompanySignature: Boolean(document.includeCompanySignature),
      hrSignature: document.hrSignature,
      completedAt: document.completedAt,
      createdAt: document.createdAt,
      counterpartName: document.counterpartName,
      recipients: visibleRecipients.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        status: r.status,
        signingOrder: r.signingOrder,
        signingStep: r.signingStep || r.signingOrder,
        stepLabel: r.stepLabel,
        signedAt: r.signedAt,
        signatureName: r.signatureName,
        fieldValues: r.fieldValues || {},
      })),
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
  if (isRecipientSuperseded(document, recipient.id)) {
    return res.status(403).json({
      error:
        "This signing link is no longer valid. Another party already completed a private copy of this agreement.",
      superseded: true,
    });
  }
  if (!canRecipientActNow(document, recipient.id)) {
    return res.status(403).json({
      error:
        "It is not your turn to sign yet. You will receive an email when the previous signatory has completed.",
    });
  }

  const signatureName = String(req.body?.signatureName ?? recipient.name).trim();
  if (!signatureName) {
    return res.status(400).json({ error: "Signature name is required" });
  }

  const rawFieldValues =
    req.body?.fieldValues && typeof req.body.fieldValues === "object"
      ? (req.body.fieldValues as Record<string, unknown>)
      : {};
  const fieldValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawFieldValues)) {
    const cleaned = String(value ?? "").trim();
    if (cleaned) fieldValues[key] = cleaned.slice(0, 500);
  }

  recipient.status = "signed";
  recipient.signedAt = new Date().toISOString();
  recipient.signatureName = signatureName;
  recipient.fieldValues = fieldValues;

  document.status = recomputeStatus({ ...document, status: "sent" });
  if (document.status === "completed") {
    document.completedAt = new Date().toISOString();
  }
  const saved = saveDocument(document)!;
  const baseUrl = publicSignBaseUrl();

  // Always thank the signer immediately (general policy).
  await sendThankYouForSigningEmail({
    to: recipient.email,
    recipientName: recipient.name,
    documentTitle: saved.title,
    documentType: saved.documentType,
    viewUrl: `${baseUrl}/sign/${recipient.token}`,
    waitingForNext: saved.status !== "completed",
  });

  // Sequential by step: as soon as the current step is satisfied, email the next step.
  if (saved.signingMode === "sequential" && saved.status !== "completed") {
    const nextStep = getCurrentStep(saved.recipients);
    if (nextStep) {
      const toNotify = sortRecipientsByOrder(saved.recipients).filter(
        (r) =>
          r.status === "pending" &&
          (r.signingStep || r.signingOrder || 1) === nextStep &&
          !r.sentAt,
      );
      if (toNotify.length) {
        const now = new Date().toISOString();
        for (const next of toNotify) {
          next.sentAt = now;
        }
        saveDocument(saved);
        for (const next of toNotify) {
          await emailSignRequestForRecipient(saved, next);
        }
      }
    }
  }

  if (saved.status === "completed") {
    const parties = [
      ...(saved.hrSignature
        ? [`${saved.hrSignature.name} (Company)`]
        : [`${saved.createdByName} (Prepared by)`]),
      ...sortRecipientsByOrder(saved.recipients)
        .filter((r) => r.status === "signed")
        .map((r) => `${r.signatureName || r.name} (Signatory ${r.signingOrder || ""})`.trim()),
    ];

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
      signingOrder: recipient.signingOrder,
      signingStep: recipient.signingStep || recipient.signingOrder,
      stepLabel: recipient.stepLabel,
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
  // Warm employee directory in the background so the first UI load is faster.
  void listEmployeesAndDepartments()
    .then((data) => {
      console.log(`Employee directory ready: ${data.employees.length} people`);
    })
    .catch((error) => {
      console.warn(
        "Employee directory warm-up failed:",
        error instanceof Error ? error.message : error,
      );
    });
});
