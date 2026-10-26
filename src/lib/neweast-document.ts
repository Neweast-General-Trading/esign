import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { absoluteAssetUrl, formatDateTime } from "@/lib/utils";
import {
  APP_NAME,
  GENERATED_BY_LABEL,
  OFFICIAL_DOCUMENT_LABEL,
  SIGNED_VIA_LABEL,
} from "@/lib/branding";
import {
  hasCompanySignatureField,
  hasInlineSignatureFields,
  hydrateSignatureFields,
  signatureFieldExportCss,
} from "@/lib/signature-fields";
import {
  collectFieldValues,
  hydrateInputFields,
  inputFieldExportCss,
} from "@/lib/input-fields";
import { compactSignerOrdersInHtml } from "@/lib/signer-order";
import type { SignDocument } from "@/lib/types";

const A4_WIDTH_PX = 794; // ~210mm at 96dpi
const PAGE_MARGIN_MM = 12;
const LOGO_CACHE = new Map<string, string>();

type ExportDocument = Pick<
  SignDocument,
  | "id"
  | "title"
  | "documentType"
  | "contentHtml"
  | "createdByName"
  | "createdAt"
  | "hrSignature"
  | "includeCompanySignature"
  | "recipients"
  | "completedAt"
  | "status"
>;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function safePdfFilename(title: string) {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return `${cleaned || `${APP_NAME}-Document`}.pdf`;
}

async function loadLogoDataUrl() {
  const src = absoluteAssetUrl("logo.png");
  const cached = LOGO_CACHE.get(src);
  if (cached) return cached;

  try {
    const response = await fetch(src, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Logo HTTP ${response.status}`);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read logo"));
      reader.readAsDataURL(blob);
    });
    if (dataUrl) LOGO_CACHE.set(src, dataUrl);
    return dataUrl || src;
  } catch {
    return src;
  }
}

function signatureBlock(opts: {
  role: string;
  signedName?: string;
  printName?: string;
  signedAt?: string;
  pendingLabel: string;
}) {
  if (!opts.signedName) {
    return `
      <div style="min-height:110px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:16px;">
          ${escapeHtml(opts.role)}
        </div>
        <div style="border-bottom:1px solid #cbd5e1;height:42px;margin-bottom:8px;"></div>
        <div style="font-size:11px;color:#94a3b8;">${escapeHtml(opts.pendingLabel)}</div>
      </div>
    `;
  }

  return `
    <div style="min-height:110px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">
        ${escapeHtml(opts.role)}
      </div>
      <div style="min-height:44px;display:flex;align-items:flex-end;padding-bottom:4px;border-bottom:1px solid #0f172a;">
        <div style="font-family:'Segoe Script','Brush Script MT','Lucida Handwriting',cursive;font-size:26px;line-height:1.1;color:#1e3a8a;">
          ${escapeHtml(opts.signedName)}
        </div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#334155;line-height:1.45;">
        <div><strong>${escapeHtml(opts.printName || opts.signedName)}</strong></div>
        ${
          opts.signedAt
            ? `<div style="color:#64748b;">Signed ${escapeHtml(formatDateTime(opts.signedAt))}</div>`
            : ""
        }
        <div style="color:#64748b;font-size:10px;margin-top:2px;">${SIGNED_VIA_LABEL}</div>
      </div>
    </div>
  `;
}

export function buildNeweastDocumentHtml(
  document: ExportDocument,
  options?: { logoSrc?: string },
) {
  const logoSrc = options?.logoSrc || absoluteAssetUrl("logo.png");
  const bodyText = `${document.title} ${document.contentHtml.replace(/<[^>]+>/g, " ")}`;
  const rtl = hasArabic(bodyText);
  const employeeSignatures = document.recipients.filter((r) => r.status === "signed");
  const contentHtml = compactSignerOrdersInHtml(document.contentHtml || "<p></p>");
  const inlineFields = hasInlineSignatureFields(contentHtml);
  const showCompanyBlock =
    Boolean(document.includeCompanySignature) ||
    Boolean(document.hrSignature) ||
    hasCompanySignatureField(contentHtml);
  const hydratedBody = hydrateInputFields(
    hydrateSignatureFields(contentHtml, {
      recipients: document.recipients,
      hrSignature: document.hrSignature,
    }),
    collectFieldValues(document.recipients),
  );

  const employeesHtml =
    employeeSignatures.length === 0
      ? signatureBlock({
          role: showCompanyBlock ? "Employee" : "Signatory",
          pendingLabel: "Awaiting signature",
        })
      : employeeSignatures
          .map((r) =>
            signatureBlock({
              role:
                employeeSignatures.length > 1
                  ? `${showCompanyBlock ? "Employee" : "Signatory"} — ${r.name}`
                  : showCompanyBlock
                    ? "Employee"
                    : "Signatory",
              signedName: r.signatureName || r.name,
              printName: r.name,
              signedAt: r.signedAt,
              pendingLabel: "Awaiting signature",
            }),
          )
          .join('<div style="height:18px;"></div>');

  const ref = document.id.slice(0, 8).toUpperCase();

  const companyCell = showCompanyBlock
    ? `
            <td style="width:48%;vertical-align:top;padding-${rtl ? "left" : "right"}:16px;">
              ${
                document.hrSignature
                  ? signatureBlock({
                      role: "For the Company / HR",
                      signedName: document.hrSignature.name,
                      printName: document.hrSignature.name,
                      signedAt: document.hrSignature.signedAt,
                      pendingLabel: "Awaiting company signature",
                    })
                  : signatureBlock({
                      role: "For the Company / HR",
                      pendingLabel: "Awaiting company signature",
                    })
              }
            </td>
            <td style="width:4%;"></td>
            <td style="width:48%;vertical-align:top;padding-${rtl ? "right" : "left"}:16px;">
              ${employeesHtml}
            </td>`
    : `
            <td style="width:100%;vertical-align:top;">
              ${employeesHtml}
            </td>`;

  const footerSignaturesHtml = inlineFields
    ? ""
    : `
        <div style="height:1px;background:#e2e8f0;margin:28px 0 16px;"></div>

        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:14px;">
          Signatures
        </div>

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            ${companyCell}
          </tr>
        </table>
      `;

  return `
    <div
      lang="${rtl ? "ar" : "en"}"
      dir="${rtl ? "rtl" : "ltr"}"
      style="box-sizing:border-box;width:100%;font-family:Georgia,'Times New Roman',Times,serif;background:#ffffff;color:#0f172a;"
    >
      <style>
        .esign-doc *, .esign-doc *::before, .esign-doc *::after { box-sizing: border-box; }
        .esign-doc .meta td { padding: 3px 0; vertical-align: top; font-size: 11px; color: #334155; }
        .esign-doc .meta .label { width: 110px; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
        .esign-doc .body { font-size: 13.5px; line-height: 1.7; color: #1e293b; font-family: Georgia, 'Times New Roman', Times, serif; }
        .esign-doc .body p { margin: 0 0 10px; }
        .esign-doc .body ul, .esign-doc .body ol { margin: 0 0 10px; padding-${rtl ? "right" : "left"}: 22px; }
        .esign-doc .body h1, .esign-doc .body h2, .esign-doc .body h3 { margin: 14px 0 8px; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
        .esign-doc .body h1 { font-size: 16px; }
        .esign-doc .body h2 { font-size: 14px; }
        .esign-doc .body h3 { font-size: 13px; }
        .esign-doc .body img { max-width: 100%; height: auto; }
        .esign-doc .body table { width: 100%; border-collapse: collapse; margin: 0 0 12px; }
        .esign-doc .body td, .esign-doc .body th {
          border: 1px solid #cbd5e1;
          padding: 8px 8px;
          font-size: 12px;
          line-height: 1.7;
          vertical-align: top;
          overflow: visible !important;
          word-break: normal;
          overflow-wrap: break-word;
        }
        .esign-doc .body tr,
        .esign-doc .body p,
        .esign-doc .body li,
        .esign-doc .body h1,
        .esign-doc .body h2,
        .esign-doc .body h3 {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        ${signatureFieldExportCss()}
        ${inputFieldExportCss()}
      </style>

      <div class="esign-doc" style="padding: 36px 44px 28px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
          <tr>
            <td style="vertical-align:middle;width:120px;">
              <img src="${logoSrc}" alt="NEWEAST" style="height:48px;width:auto;display:block;object-fit:contain;" />
            </td>
            <td style="vertical-align:middle;text-align:${rtl ? "left" : "right"};">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#7f1d1d;letter-spacing:0.04em;">
                NEWEAST GENERAL TRADING
              </div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#64748b;margin-top:3px;">
                ${OFFICIAL_DOCUMENT_LABEL}
              </div>
            </td>
          </tr>
        </table>

        <div style="height:3px;background:#7f1d1d;margin-bottom:2px;"></div>
        <div style="height:1px;background:#cbd5e1;margin-bottom:20px;"></div>

        <h1 style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.35;font-weight:700;color:#0f172a;">
          ${escapeHtml(document.title)}
        </h1>

        <div class="body">
          ${hydratedBody}
        </div>

        ${footerSignaturesHtml}

        <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#94a3b8;text-align:center;line-height:1.5;">
          ${GENERATED_BY_LABEL}
          ${
            document.completedAt
              ? ` · Completed ${escapeHtml(formatDateTime(document.completedAt))}`
              : ""
          }
          · Ref ES-${escapeHtml(ref)}
          · © ${new Date().getFullYear()} Neweast Trading
        </div>
      </div>
    </div>
  `;
}

type PdfCapture = {
  canvas: HTMLCanvasElement;
  cssHeight: number;
  /** Y positions (CSS px) where a page may end without cutting a line or table row. */
  safeBottoms: number[];
};

/** Page ends snapped to block bottoms so rows and sentences are not sliced in half. */
export function computePageBreaks(
  totalHeight: number,
  pageHeight: number,
  safeBottoms: number[],
) {
  const points = [...new Set(safeBottoms.map((y) => Math.round(y)))]
    .filter((y) => y > 0 && y < totalHeight - 1)
    .sort((a, b) => a - b);
  const ends: number[] = [];
  let start = 0;
  const minSlice = 24;

  while (start < totalHeight - 0.5) {
    const limit = Math.min(totalHeight, start + pageHeight);
    if (limit >= totalHeight - 0.5) {
      ends.push(totalHeight);
      break;
    }

    let breakAt = -1;
    for (const y of points) {
      if (y <= start + minSlice) continue;
      if (y <= limit + 0.5) breakAt = y;
      else break;
    }
    if (breakAt < 0) breakAt = limit;
    if (breakAt <= start) breakAt = Math.min(totalHeight, start + pageHeight);
    ends.push(breakAt);
    start = breakAt;
  }

  return ends;
}

function collectSafeBottoms(root: HTMLElement) {
  const rootTop = root.getBoundingClientRect().top;
  const nodes = root.querySelectorAll(
    "tr, p, h1, h2, h3, h4, li, blockquote, img, pre",
  );
  const bottoms: number[] = [];
  nodes.forEach((node) => {
    if (node.tagName !== "TR" && node.closest("table")) return;
    const rect = node.getBoundingClientRect();
    if (rect.height < 2) return;
    bottoms.push(rect.bottom - rootTop);
  });
  return bottoms;
}

async function renderDocumentCanvas(documentData: ExportDocument): Promise<PdfCapture> {
  const logoSrc = await loadLogoDataUrl();
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = `${A4_WIDTH_PX}px`;
  container.style.background = "#ffffff";
  container.style.color = "#0f172a";
  container.style.fontFamily = "Georgia, 'Times New Roman', Times, serif";
  container.style.zIndex = "-1";
  container.setAttribute("data-esign-pdf-root", "1");
  container.innerHTML = buildNeweastDocumentHtml(documentData, { logoSrc });
  document.body.appendChild(container);

  // Ensure images are decoded before capture
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
    ),
  );

  let cssHeight = container.scrollHeight;
  let safeBottoms = collectSafeBottoms(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000,
      width: A4_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
      scrollX: 0,
      scrollY: 0,
      // Tailwind v4 uses oklch(); html2canvas cannot parse it. Strip app stylesheets
      // from the clone so only our hex/inline export CSS remains.
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
          const text = (node.textContent || "").toLowerCase();
          const keepExportCss =
            node.tagName === "STYLE" && text.includes("esign-doc");
          if (keepExportCss) return;
          if (
            node.tagName === "LINK" ||
            text.includes("oklch") ||
            text.includes("@theme") ||
            text.includes("tailwind")
          ) {
            node.remove();
          }
        });
        const painted = clonedDoc.querySelector("[data-esign-pdf-root]");
        if (painted instanceof HTMLElement && painted.scrollHeight > 0) {
          painted.querySelectorAll("td, th, p, span").forEach((node) => {
            if (node instanceof HTMLElement) node.style.overflow = "visible";
          });
          const bottoms = collectSafeBottoms(painted);
          if (bottoms.length) {
            cssHeight = painted.scrollHeight;
            safeBottoms = bottoms;
          }
        }
        const root = clonedDoc.body;
        root.style.background = "#ffffff";
        root.style.color = "#0f172a";
        root.style.fontFamily = "Georgia, 'Times New Roman', Times, serif";
      },
    });

    if (!canvas.width || !canvas.height) {
      throw new Error("PDF render produced an empty page");
    }

    return {
      canvas,
      cssHeight: cssHeight || container.scrollHeight,
      safeBottoms,
    };
  } finally {
    document.body.removeChild(container);
  }
}

function writeCanvasToPdf(capture: PdfCapture) {
  const { canvas } = capture;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN_MM * 2;
  const contentHeight = pageHeight - PAGE_MARGIN_MM * 2;

  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const addSlice = (sourceY: number, sliceHeight: number, pageIndex: number) => {
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeight;
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare PDF page");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );

    const pxPerMm = canvas.width / imgWidth;
    const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
    const sliceHeightMm = sliceHeight / pxPerMm;
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(
      sliceData,
      "JPEG",
      PAGE_MARGIN_MM,
      PAGE_MARGIN_MM,
      imgWidth,
      sliceHeightMm,
      undefined,
      "FAST",
    );
  };

  // Single page
  if (imgHeight <= contentHeight) {
    addSlice(0, canvas.height, 0);
    return pdf;
  }

  const pxPerMm = canvas.width / imgWidth;
  const pageSliceHeightPx = Math.floor(contentHeight * pxPerMm);
  const cssHeight = capture.cssHeight > 0 ? capture.cssHeight : canvas.height;
  const scale = canvas.height / cssHeight;
  const pageHeightCss = pageSliceHeightPx / scale;
  const breaks = computePageBreaks(cssHeight, pageHeightCss, capture.safeBottoms);

  let startCss = 0;
  breaks.forEach((endCss, pageIndex) => {
    const sourceY = Math.round(startCss * scale);
    const endY =
      pageIndex === breaks.length - 1
        ? canvas.height
        : Math.min(canvas.height, Math.round(endCss * scale));
    const sliceHeight = endY - sourceY;
    if (sliceHeight > 1) addSlice(sourceY, sliceHeight, pageIndex);
    startCss = endCss;
  });

  return pdf;
}

export async function downloadNeweastPdf(documentData: ExportDocument) {
  const capture = await renderDocumentCanvas(documentData);
  const pdf = writeCanvasToPdf(capture);
  pdf.save(safePdfFilename(documentData.title));
}

export async function openNeweastDocument(documentData: ExportDocument) {
  const logoSrc = await loadLogoDataUrl();
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(documentData.title)} | ${APP_NAME}</title>
  <style>
    body { margin: 0; background: #e2e8f0; padding: 24px 12px 48px; }
    .sheet {
      max-width: 794px;
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 18px 50px -28px rgba(15, 23, 42, 0.45);
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${buildNeweastDocumentHtml(documentData, { logoSrc })}
  </div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    // Popup blocked — fallback to same-tab navigation
    window.location.href = url;
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
