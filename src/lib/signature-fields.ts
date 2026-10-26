import { Node, mergeAttributes } from "@tiptap/core";
import type { RecipientPublic, SignatureRecord } from "@/lib/types";
import { getRecipientStep } from "@/lib/recipient-step";

export type SignatureFieldRole = "signatory" | "company";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    signatureField: {
      insertSignatureField: (attrs: {
        signerOrder?: number;
        role?: SignatureFieldRole;
        label?: string;
      }) => ReturnType;
    };
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function hasInlineSignatureFields(html: string) {
  return /data-esign-signature-field/i.test(html || "");
}

export function hasCompanySignatureField(html: string) {
  if (!html || !hasInlineSignatureFields(html)) return false;
  return /data-esign-signature-field[^>]*data-role=["']company["']/i.test(html)
    || /data-role=["']company["'][^>]*data-esign-signature-field/i.test(html);
}

export function defaultFieldLabel(role: SignatureFieldRole, signerOrder: number) {
  if (role === "company") return "Company / HR signature";
  return `Step ${signerOrder} signature`;
}

/** TipTap atom node: places a signature box inside the document body. */
export const SignatureField = Node.create({
  name: "signatureField",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      fieldId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-field-id"),
        renderHTML: (attrs) =>
          attrs.fieldId ? { "data-field-id": String(attrs.fieldId) } : {},
      },
      role: {
        default: "signatory",
        parseHTML: (el) => el.getAttribute("data-role") || "signatory",
        renderHTML: (attrs) => ({ "data-role": attrs.role || "signatory" }),
      },
      signerOrder: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-signer-order") || 1),
        renderHTML: (attrs) => ({
          "data-signer-order": String(attrs.signerOrder || 1),
        }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) =>
          attrs.label ? { "data-label": String(attrs.label) } : {},
      },
    };
  },

  parseHTML() {
    return [
      { tag: "div[data-esign-signature-field]" },
      { tag: "span[data-esign-signature-field]" },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const role = (node.attrs.role || "signatory") as SignatureFieldRole;
    const order = Number(node.attrs.signerOrder || 1);
    const label =
      String(node.attrs.label || "").trim() || defaultFieldLabel(role, order);

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-esign-signature-field": "1",
        class: "esign-signature-field",
        contenteditable: "false",
        title: label,
      }),
      ["span", { class: "esign-signature-field__line" }, "\u00a0"],
    ];
  },

  addCommands() {
    return {
      insertSignatureField:
        (attrs) =>
        ({ commands }) => {
          const role = (attrs.role || "signatory") as SignatureFieldRole;
          const signerOrder = Number(attrs.signerOrder || 1);
          const label =
            attrs.label?.trim() || defaultFieldLabel(role, signerOrder);
          return commands.insertContent({
            type: this.name,
            attrs: {
              fieldId:
                typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `sf-${Date.now()}`,
              role,
              signerOrder,
              label,
            },
          });
        },
    };
  },
});

function signedFieldHtml(opts: { signedNames: string[]; label?: string }) {
  const scripts = opts.signedNames
    .map(
      (name) =>
        `<span class="esign-signature-field__script">${escapeHtml(name)}</span>`,
    )
    .join("");
  const caption = opts.label?.trim()
    ? `<span class="esign-signature-field__name">${escapeHtml(opts.label.trim())}:</span>`
    : "";
  return `
    <span class="esign-signature-field esign-signature-field--signed" data-esign-signature-field="1" contenteditable="false">
      ${caption}
      ${scripts}
    </span>
  `;
}

function pendingFieldHtml(label?: string) {
  const caption = label?.trim()
    ? `<span class="esign-signature-field__name">${escapeHtml(label.trim())}:</span>`
    : "";
  return `
    <span class="esign-signature-field esign-signature-field--pending" data-esign-signature-field="1" contenteditable="false">
      ${caption}
      <span class="esign-signature-field__line">&nbsp;</span>
    </span>
  `;
}

/** Replace placeholder fields with signed/pending boxes for view + PDF.
 *  data-signer-order on fields = signing STEP (Employees=1, Manager=2), not person index.
 */
export function hydrateSignatureFields(
  html: string,
  options: {
    recipients: RecipientPublic[];
    hrSignature?: SignatureRecord | null;
  },
) {
  if (!html || !hasInlineSignatureFields(html)) return html;

  const doc = new DOMParser().parseFromString(
    `<div id="esign-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("esign-root");
  if (!root) return html;

  const byStep = new Map<number, RecipientPublic[]>();
  for (const recipient of options.recipients) {
    const step = getRecipientStep(recipient);
    const list = byStep.get(step) || [];
    list.push(recipient);
    byStep.set(step, list);
  }

  root.querySelectorAll("[data-esign-signature-field]").forEach((node) => {
    const el = node as HTMLElement;
    const role = (el.getAttribute("data-role") || "signatory") as SignatureFieldRole;
    const step = Number(el.getAttribute("data-signer-order") || 1);
    const label = el.getAttribute("data-label")?.trim() || "";

    let replacement = pendingFieldHtml(label);

    if (role === "company") {
      if (options.hrSignature?.name) {
        replacement = signedFieldHtml({
          label,
          signedNames: [options.hrSignature.name],
        });
      }
    } else {
      const inStep = byStep.get(step) || [];
      const signed = inStep.filter((r) => r.status === "signed");
      if (signed.length) {
        replacement = signedFieldHtml({
          label,
          signedNames: signed.map((r) => r.signatureName || r.name),
        });
      }
    }

    const wrap = doc.createElement("div");
    wrap.innerHTML = replacement.trim();
    const next = wrap.firstElementChild;
    if (next) {
      const keep = ["data-field-id", "data-role", "data-signer-order", "data-label"];
      keep.forEach((name) => {
        const value = el.getAttribute(name);
        if (value) next.setAttribute(name, value);
      });
      el.replaceWith(next);
    }
  });

  return root.innerHTML;
}

/** Inline CSS used by PDF/Open HTML export (no app stylesheet). */
export function signatureFieldExportCss() {
  return `
    .esign-signature-field {
      display: inline-block;
      vertical-align: baseline;
      width: 100%;
      max-width: 100%;
      margin: 4px 0;
      padding: 8px 0 4px;
      border: none;
      background: transparent;
      box-sizing: border-box;
      overflow: visible;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .esign-signature-field__title,
    .esign-signature-field__meta,
    .esign-signature-field__via,
    .esign-signature-field__box {
      display: none !important;
    }
    .esign-signature-field__name {
      display: block;
      margin-bottom: 2px;
      font-family: Georgia, 'Times New Roman', Times, serif;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.6;
      color: #0f172a;
    }
    .esign-signature-field__line {
      display: block;
      width: 100%;
      min-height: 1.8em;
      border-bottom: 1px solid #64748b;
      line-height: 1.8;
      overflow: visible;
    }
    .esign-signature-field--signed {
      border: none;
      background: transparent;
    }
    .esign-signature-field__script {
      display: block;
      width: 100%;
      min-height: 2em;
      border-bottom: 1px solid #0f172a;
      font-family: 'Segoe Script','Brush Script MT','Lucida Handwriting',cursive;
      font-size: 22px;
      line-height: 1.8;
      color: #1e3a8a;
      padding: 8px 2px 4px;
      margin-bottom: 4px;
      overflow: visible;
    }
    .esign-signature-field__script:last-child {
      margin-bottom: 0;
    }
  `;
}
