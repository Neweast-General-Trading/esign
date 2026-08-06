import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { absoluteAssetUrl, formatDateTime } from "@/lib/utils";
import type { SignDocument } from "@/lib/types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function signatureBlock(name: string, meta: string) {
  return `
    <div style="border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:14px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">${meta}</div>
      <div style="min-height:56px;display:flex;align-items:center;justify-content:center;border:1px solid #bfdbfe;border-radius:10px;background:linear-gradient(135deg,#eff6ff,#ffffff);padding:10px 12px;">
        <div style="font-family:'Segoe Script','Brush Script MT','Lucida Handwriting',cursive;font-size:28px;color:#1d4ed8;text-align:center;">
          ${escapeHtml(name)}
        </div>
      </div>
    </div>
  `;
}

export function buildNeweastDocumentHtml(
  document: Pick<
    SignDocument,
    | "title"
    | "documentType"
    | "contentHtml"
    | "createdByName"
    | "createdAt"
    | "hrSignature"
    | "recipients"
    | "completedAt"
    | "status"
  >,
) {
  const employeeSignatures = document.recipients.filter((r) => r.status === "signed");
  const employeeHtml =
    employeeSignatures.length === 0
      ? `<p style="font-size:13px;color:#94a3b8;">Awaiting employee signatures</p>`
      : employeeSignatures
          .map(
            (r) => `
          <div style="margin-bottom:12px;">
            ${signatureBlock(r.signatureName || r.name, "Employee")}
            <div style="margin-top:6px;font-size:11px;color:#64748b;">
              ${escapeHtml(r.name)}${r.signedAt ? `<br/>Signed ${escapeHtml(formatDateTime(r.signedAt))}` : ""}
            </div>
          </div>
        `,
          )
          .join("");

  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:780px;margin:0 auto;background:#ffffff;color:#0f172a;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#b91c1c,#dc2626,#f43f5e);padding:18px 24px;color:#fff;">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;opacity:0.9;">NEWEAST E-Sign Document</div>
            <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;">${escapeHtml(document.title)}</h1>
            <div style="margin-top:6px;font-size:12px;opacity:0.9;">
              ${escapeHtml(document.documentType)} · Prepared by ${escapeHtml(document.createdByName)}
            </div>
          </div>
          <img src="${absoluteAssetUrl("logo.png")}" alt="NEWEAST" style="height:40px;background:#fff;border-radius:8px;padding:6px;object-fit:contain;" />
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:12px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">
        <div>
          <div style="font-weight:700;color:#94a3b8;">Document Type</div>
          <div style="margin-top:2px;font-weight:600;color:#0f172a;">${escapeHtml(document.documentType)}</div>
        </div>
        <div>
          <div style="font-weight:700;color:#94a3b8;">Created</div>
          <div style="margin-top:2px;font-weight:600;color:#0f172a;">${escapeHtml(formatDateTime(document.createdAt))}</div>
        </div>
        <div>
          <div style="font-weight:700;color:#94a3b8;">Status</div>
          <div style="margin-top:2px;font-weight:600;color:#0f172a;text-transform:capitalize;">${escapeHtml(document.status.replaceAll("_", " "))}</div>
        </div>
      </div>

      <div style="padding:24px;font-size:14px;line-height:1.7;color:#334155;" class="doc-body">
        <style>
          .doc-body p { margin: 0 0 10px; }
          .doc-body ul, .doc-body ol { margin: 0 0 10px; padding-left: 22px; }
          .doc-body h1, .doc-body h2, .doc-body h3 { margin: 0 0 8px; color: #0f172a; }
        </style>
        ${document.contentHtml}
      </div>

      <div style="padding:0 24px 24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">
          Electronic Signatures
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            ${
              document.hrSignature
                ? `${signatureBlock(document.hrSignature.name, "HR / Company")}
                   <div style="margin-top:6px;font-size:11px;color:#64748b;">
                     ${escapeHtml(document.hrSignature.name)}<br/>
                     Signed ${escapeHtml(formatDateTime(document.hrSignature.signedAt))}
                   </div>`
                : `<p style="font-size:13px;color:#94a3b8;">Awaiting HR signature</p>`
            }
          </div>
          <div>${employeeHtml}</div>
        </div>
      </div>

      <div style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:12px 24px;text-align:center;font-size:10px;color:#94a3b8;">
        Official NEWEAST E-Sign Document
        ${document.completedAt ? ` · Completed ${escapeHtml(formatDateTime(document.completedAt))}` : ""}
        · © ${new Date().getFullYear()} Neweast Trading
      </div>
    </div>
  `;
}

export async function downloadNeweastPdf(documentData: SignDocument) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "820px";
  container.innerHTML = buildNeweastDocumentHtml(documentData);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${documentData.title.replace(/[^a-z0-9-_ ]/gi, "_") || "neweast-document"}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

export function openNeweastDocument(documentData: SignDocument) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(documentData.title)} | NEWEAST E-Sign</title>
  <style>
    body { margin: 0; background: #f8fafc; padding: 24px; }
  </style>
</head>
<body>
  ${buildNeweastDocumentHtml(documentData)}
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
