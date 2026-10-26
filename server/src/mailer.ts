import nodemailer from "nodemailer";
import { escapeHtml } from "./employees.js";

const APP_NAME = "E-Sign";

export interface MailResult {
  ok: boolean;
  dryRun?: boolean;
  error?: string;
}

function mailEnabled() {
  return process.env.MAIL_ENABLED !== "false" && Boolean(process.env.SMTP_PASS?.trim());
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    name: process.env.SMTP_EHLO_NAME || "esign.neweast.cloud",
    auth: {
      user: process.env.SMTP_USER || "esign.app@neweast.co",
      pass: process.env.SMTP_PASS || "",
    },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return transporter;
}

export async function verifySmtp(): Promise<MailResult> {
  if (!mailEnabled()) return { ok: true, dryRun: true };
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function applyTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return vars[key] ?? "";
  });
}

export function getMailBccList(): string[] {
  const raw = (process.env.MAIL_BCC || "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function mailBccList() {
  return getMailBccList();
}

function emailShell(options: {
  preheader: string;
  eyebrow: string;
  title: string;
  bodyHtml: string;
  footerNote?: string;
}) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escapeHtml(options.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:0;background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 48%,#b91c1c 100%);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:28px 28px 22px;">
                    <div style="font-size:11px;letter-spacing:0.18em;font-weight:700;color:rgba(255,255,255,0.82);">
                      ${escapeHtml(options.eyebrow)}
                    </div>
                    <div style="margin-top:10px;font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;">
                      ${escapeHtml(options.title)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${options.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
              ${options.footerNote || `This message was sent by ${APP_NAME}. Please do not reply to this email.`}<br/>
              &copy; ${year} Neweast Trading. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string, color = "#dc2626") {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
    <tr>
      <td align="center" bgcolor="${color}" style="border-radius:12px;">
        <a href="${escapeHtml(href)}"
           style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

function secureLinkCard(href: string) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
    <tr>
      <td style="padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">
          Your personal secure link
        </div>
        <div style="margin-top:8px;font-size:12px;line-height:1.5;word-break:break-all;">
          <a href="${escapeHtml(href)}" style="color:#b91c1c;text-decoration:underline;">
            ${escapeHtml(href)}
          </a>
        </div>
        <div style="margin-top:8px;font-size:11px;color:#94a3b8;">
          This link is unique to you. Do not forward it to anyone else.
        </div>
      </td>
    </tr>
  </table>`;
}

function detailRow(label: string, value: string) {
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;width:38%;font-size:13px;color:#64748b;">
      ${escapeHtml(label)}
    </td>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;color:#0f172a;">
      ${escapeHtml(value)}
    </td>
  </tr>`;
}

/**
 * Never throws: a rejected SMTP login must not abort the signing workflow.
 */
async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<MailResult> {
  const to = options.to.trim();
  const bcc = mailBccList();

  if (!mailEnabled()) {
    console.log("[e-sign mail:dry-run]", { to, bcc, subject: options.subject });
    return { ok: true, dryRun: true };
  }

  try {
    await getTransporter().sendMail({
      from:
        process.env.MAIL_FROM ||
        `"E-Sign | NEWEAST" <${process.env.SMTP_USER || "esign.app@neweast.co"}>`,
      replyTo: process.env.MAIL_REPLY_TO || undefined,
      to,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    if (bcc.length > 0) {
      console.log(`[e-sign mail:bcc] ${to} (+ ${bcc.join(", ")})`);
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[e-sign mail:failed] ${to}: ${message}`);
    return { ok: false, error: message };
  }
}

export const DEFAULT_SIGN_EMAIL_SUBJECT = "Action required: sign {{documentTitle}}";

export const DEFAULT_SIGN_EMAIL_BODY = `Dear {{employeeName}},

You have been requested to sign the following document via ${APP_NAME}.

Please use the secure button in this email. Your link is personal and should not be shared.

Regards,
${APP_NAME}`;

export async function sendSignRequestEmail(params: {
  to: string;
  recipientName: string;
  designation?: string;
  department?: string;
  companyName?: string;
  documentTitle: string;
  documentType: string;
  hrName: string;
  signUrl: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
}) {
  const vars = {
    employeeName: params.recipientName,
    designation: params.designation || "",
    department: params.department || "",
    companyName: params.companyName || "",
    documentTitle: params.documentTitle,
    documentType: params.documentType,
    hrName: params.hrName,
    // Keep placeholder readable in plain-text body; HTML CTA carries the real clickable link.
    signUrl: "your personal secure link below",
  };

  const subject = applyTemplate(
    params.subjectTemplate?.trim() || DEFAULT_SIGN_EMAIL_SUBJECT,
    { ...vars, signUrl: params.signUrl },
  );

  const bodyText = applyTemplate(
    params.bodyTemplate?.trim() || DEFAULT_SIGN_EMAIL_BODY,
    vars,
  )
    // Avoid dumping a raw URL into escaped HTML (Outlook often breaks long links).
    .replace(params.signUrl, "your personal secure link below")
    .replace(/\{\{\s*signUrl\s*\}\}/gi, "your personal secure link below");

  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  const details = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;">
    <tr>
      <td style="padding:6px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailRow("Document", params.documentTitle)}
          ${detailRow("Type", params.documentType)}
          ${detailRow("Requested by", params.hrName)}
          ${params.companyName ? detailRow("Company", params.companyName) : ""}
          ${params.department ? detailRow("Department", params.department) : ""}
          ${detailRow("Recipient", params.recipientName)}
        </table>
      </td>
    </tr>
  </table>`;

  const html = emailShell({
    preheader: `Please sign ${params.documentTitle} — your personal ${APP_NAME} link is ready.`,
    eyebrow: APP_NAME.toUpperCase(),
    title: "Signature requested",
    bodyHtml: `
      ${paragraphs}
      ${details}
      ${ctaButton(params.signUrl, "Review & Sign Document")}
      ${secureLinkCard(params.signUrl)}
    `,
  });

  const text = `${bodyText}

Document: ${params.documentTitle}
Type: ${params.documentType}
Requested by: ${params.hrName}
Recipient: ${params.recipientName}

Open your personal secure link:
${params.signUrl}
`;

  return sendMail({
    to: params.to,
    subject,
    html,
    text,
  });
}

export async function sendCompletedCopyEmail(params: {
  to: string;
  recipientName: string;
  documentTitle: string;
  documentType: string;
  viewUrl: string;
  parties: string[];
}) {
  const partiesHtml = params.parties
    .map(
      (p) =>
        `<li style="margin:0 0 6px;font-size:14px;color:#334155;">${escapeHtml(p)}</li>`,
    )
    .join("");

  const html = emailShell({
    preheader: `${params.documentTitle} is fully signed.`,
    eyebrow: APP_NAME.toUpperCase(),
    title: "Document completed",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">
        Dear ${escapeHtml(params.recipientName)},
      </p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">
        The document <strong>${escapeHtml(params.documentTitle)}</strong>
        (${escapeHtml(params.documentType)}) has been signed by all parties.
      </p>
      <div style="margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">
        Signed parties
      </div>
      <ul style="margin:0;padding-left:18px;">${partiesHtml}</ul>
      ${ctaButton(params.viewUrl, "View Signed Document", "#059669")}
      ${secureLinkCard(params.viewUrl)}
    `,
  });

  return sendMail({
    to: params.to,
    subject: `Signed copy: ${params.documentTitle}`,
    html,
    text: `Dear ${params.recipientName},\n\nThe document ${params.documentTitle} has been signed by all parties.\n\nView: ${params.viewUrl}\n`,
  });
}

export async function sendThankYouForSigningEmail(params: {
  to: string;
  recipientName: string;
  documentTitle: string;
  documentType: string;
  viewUrl: string;
  waitingForNext?: boolean;
}) {
  const nextNote = params.waitingForNext
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">
        The next signatory has been notified. You will receive the final signed copy once everyone has completed.
      </p>`
    : `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">
        You will receive the final signed copy once all remaining parties have completed.
      </p>`;

  const html = emailShell({
    preheader: `Thank you for signing ${params.documentTitle}.`,
    eyebrow: APP_NAME.toUpperCase(),
    title: "Thank you for signing",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">
        Dear ${escapeHtml(params.recipientName)},
      </p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">
        Thank you — your signature on
        <strong>${escapeHtml(params.documentTitle)}</strong>
        (${escapeHtml(params.documentType)}) has been recorded successfully.
      </p>
      ${nextNote}
      ${ctaButton(params.viewUrl, "View Document", "#059669")}
      ${secureLinkCard(params.viewUrl)}
    `,
  });

  return sendMail({
    to: params.to,
    subject: `Thank you for signing: ${params.documentTitle}`,
    html,
    text: `Dear ${params.recipientName},\n\nThank you — your signature on ${params.documentTitle} has been recorded.\n\nView: ${params.viewUrl}\n`,
  });
}
