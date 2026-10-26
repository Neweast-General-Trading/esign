import mammoth from "mammoth";

const MAX_DOCX_BYTES = 15 * 1024 * 1024; // 15 MB

export interface DocxImportResult {
  html: string;
  warnings: string[];
  suggestedTitle: string;
  hasArabic: boolean;
}

const STYLE_MAP = [
  "p[style-name='Title'] => h1.docx-title:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Subtitle'] => p.docx-subtitle:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  "p[style-name='List Paragraph'] => p:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
];

function hasArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

export function titleFromDocxFilename(filename: string) {
  return filename
    .replace(/\.docx$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateDocxFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".docx")) {
    return "Only Word documents (.docx) are supported.";
  }
  if (file.size > MAX_DOCX_BYTES) {
    return "File is too large. Maximum size is 15 MB.";
  }
  if (file.size === 0) {
    return "The selected file is empty.";
  }
  return null;
}

function stripUnsafeHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("script, iframe, object, embed, link, meta").forEach((node) => {
    node.remove();
  });

  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style" && /expression\s*\(/i.test(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }
  });

  return doc.body.innerHTML.trim();
}

function enhanceImportedHtml(html: string, rtl: boolean) {
  const doc = new DOMParser().parseFromString(
    `<div id="docx-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("docx-root");
  if (!root) return html;

  if (rtl) {
    root.setAttribute("dir", "rtl");
    root.setAttribute("lang", "ar");
    root.style.textAlign = "right";
  }

  root.querySelectorAll("table").forEach((table) => {
    table.setAttribute(
      "style",
      "width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;",
    );
    table.querySelectorAll("th, td").forEach((cell) => {
      cell.setAttribute(
        "style",
        "border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top;",
      );
    });
    table.querySelectorAll("th").forEach((cell) => {
      cell.setAttribute(
        "style",
        "border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top;background:#f8fafc;font-weight:600;",
      );
    });
  });

  root.querySelectorAll("img").forEach((img) => {
    img.setAttribute(
      "style",
      "max-width:100%;height:auto;display:block;margin:8px 0;",
    );
  });

  root.querySelectorAll("p").forEach((p) => {
    if (!p.getAttribute("style") && !p.textContent?.trim() && !p.querySelector("img")) {
      p.innerHTML = "<br/>";
    }
  });

  root.querySelectorAll("blockquote").forEach((quote) => {
    quote.setAttribute(
      "style",
      "margin:12px 0;padding:8px 14px;border-left:3px solid #cbd5e1;color:#475569;",
    );
    if (rtl) {
      quote.setAttribute(
        "style",
        "margin:12px 0;padding:8px 14px;border-right:3px solid #cbd5e1;border-left:none;color:#475569;",
      );
    }
  });

  return root.innerHTML.trim();
}

function normalizeEmptyHtml(html: string) {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<p></p>" || trimmed === "<p><br></p>") {
    throw new Error("The Word file appears to have no readable content.");
  }
  return trimmed;
}

export async function convertDocxFileToHtml(
  file: File,
): Promise<DocxImportResult> {
  const validationError = validateDocxFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: STYLE_MAP,
      includeDefaultStyleMap: true,
      includeEmbeddedStyleMap: true,
      convertImage: mammoth.images.imgElement((image) =>
        image.read("base64").then((imageBuffer) => ({
          src: `data:${image.contentType};base64,${imageBuffer}`,
        })),
      ),
    },
  );

  const plainText = result.value.replace(/<[^>]+>/g, " ");
  const rtl = hasArabic(plainText);
  const cleaned = stripUnsafeHtml(result.value);
  const enhanced = enhanceImportedHtml(cleaned, rtl);
  const html = normalizeEmptyHtml(enhanced);

  const warnings = result.messages
    .map((message) => {
      if (message.type === "warning") return message.message;
      return null;
    })
    .filter((message): message is string => Boolean(message));

  if (warnings.length === 0 && result.messages.length > 0) {
    for (const message of result.messages) {
      if (message.type !== "warning") {
        warnings.push(message.message);
      }
    }
  }

  return {
    html,
    warnings,
    suggestedTitle: titleFromDocxFilename(file.name),
    hasArabic: rtl,
  };
}
