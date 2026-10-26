import { Node, mergeAttributes } from "@tiptap/core";
import type { RecipientPublic } from "@/lib/types";

export type InputFieldType = "text" | "number" | "date";

export type InputFieldWidth = "sm" | "md" | "lg" | "full";

export const INPUT_FIELD_TYPES: Array<{
  type: InputFieldType;
  label: string;
}> = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
];

export const INPUT_FIELD_WIDTHS: Array<{
  id: InputFieldWidth;
  label: string;
  css: string;
}> = [
  { id: "sm", label: "Small", css: "7rem" },
  { id: "md", label: "Medium", css: "12rem" },
  { id: "lg", label: "Large", css: "18rem" },
  { id: "full", label: "Full width", css: "100%" },
];

/** Legacy preset names → Text */
const LEGACY_TYPE_MAP: Record<string, InputFieldType> = {
  text: "text",
  number: "number",
  date: "date",
  employee_name: "text",
  employee_id: "text",
  department: "text",
  designation: "text",
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inputField: {
      insertInputField: (attrs: {
        fieldType?: InputFieldType;
        label?: string;
        signerOrder?: number;
        required?: boolean;
        width?: InputFieldWidth;
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

export function normalizeInputFieldType(raw: string | null | undefined): InputFieldType {
  if (!raw) return "text";
  return LEGACY_TYPE_MAP[raw] || "text";
}

export function normalizeInputFieldWidth(raw: string | null | undefined): InputFieldWidth {
  if (raw === "sm" || raw === "md" || raw === "lg" || raw === "full") return raw;
  return "md";
}

export function inputFieldWidthCss(width: InputFieldWidth) {
  return INPUT_FIELD_WIDTHS.find((w) => w.id === width)?.css || "12rem";
}

export function hasInlineInputFields(html: string) {
  return /data-esign-input-field/i.test(html || "");
}

export function defaultInputLabel(type: InputFieldType, custom?: string) {
  if (custom?.trim()) return custom.trim();
  return INPUT_FIELD_TYPES.find((p) => p.type === type)?.label || "Field";
}

export interface ParsedInputField {
  fieldId: string;
  fieldType: InputFieldType;
  label: string;
  signerOrder: number;
  required: boolean;
  width: InputFieldWidth;
}

export function parseInputFieldsFromHtml(html: string): ParsedInputField[] {
  if (!html || !hasInlineInputFields(html)) return [];
  const doc = new DOMParser().parseFromString(
    `<div id="esign-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("esign-root");
  if (!root) return [];

  const fields: ParsedInputField[] = [];
  root.querySelectorAll("[data-esign-input-field]").forEach((node) => {
    const el = node as HTMLElement;
    const fieldId = el.getAttribute("data-field-id") || "";
    if (!fieldId) return;
    const fieldType = normalizeInputFieldType(el.getAttribute("data-field-type"));
    fields.push({
      fieldId,
      fieldType,
      label:
        el.getAttribute("data-label")?.trim() ||
        defaultInputLabel(fieldType),
      signerOrder: Number(el.getAttribute("data-signer-order") || 1),
      required: el.getAttribute("data-required") !== "false",
      width: normalizeInputFieldWidth(el.getAttribute("data-width")),
    });
  });
  return fields;
}

export function collectFieldValues(
  recipients: Array<Pick<RecipientPublic, "fieldValues">>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const recipient of recipients) {
    const values = recipient.fieldValues || {};
    for (const [key, value] of Object.entries(values)) {
      if (value?.trim()) merged[key] = value.trim();
    }
  }
  return merged;
}

function fieldShellHtml(params: {
  label: string;
  order: number;
  type: InputFieldType;
  width: InputFieldWidth;
  value?: string;
  filled?: boolean;
  /** Editor/preview chrome — never used in final document/PDF hydrate */
  showMeta?: boolean;
}) {
  const widthCss = inputFieldWidthCss(params.width);
  const filled = Boolean(params.filled && params.value?.trim());
  const typeLabel = INPUT_FIELD_TYPES.find((t) => t.type === params.type)?.label || "Text";
  const meta = params.showMeta
    ? `<span class="esign-input-field__title">${escapeHtml(params.label)} · ${escapeHtml(typeLabel)} · #${params.order}</span>`
    : `<span class="esign-input-field__name">${escapeHtml(params.label)}:</span>`;
  return {
    style: `display:inline-block;vertical-align:baseline;width:${widthCss};max-width:100%;box-sizing:border-box;overflow:visible;`,
    className: filled
      ? "esign-input-field esign-input-field--filled"
      : "esign-input-field esign-input-field--pending",
    inner: `
      ${meta}
      <span class="esign-input-field__box${filled ? " esign-input-field__box--filled" : ""}">${
        filled ? escapeHtml(params.value || "") : "____________"
      }</span>
    `,
  };
}

export const InputField = Node.create({
  name: "inputField",
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
      fieldType: {
        default: "text",
        parseHTML: (el) => normalizeInputFieldType(el.getAttribute("data-field-type")),
        renderHTML: (attrs) => ({
          "data-field-type": normalizeInputFieldType(attrs.fieldType),
        }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) =>
          attrs.label ? { "data-label": String(attrs.label) } : {},
      },
      signerOrder: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-signer-order") || 1),
        renderHTML: (attrs) => ({
          "data-signer-order": String(attrs.signerOrder || 1),
        }),
      },
      required: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-required") !== "false",
        renderHTML: (attrs) => ({
          "data-required": attrs.required === false ? "false" : "true",
        }),
      },
      width: {
        default: "md",
        parseHTML: (el) => normalizeInputFieldWidth(el.getAttribute("data-width")),
        renderHTML: (attrs) => ({
          "data-width": normalizeInputFieldWidth(attrs.width),
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "span[data-esign-input-field]" },
      { tag: "div[data-esign-input-field]" },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const type = normalizeInputFieldType(node.attrs.fieldType);
    const order = Number(node.attrs.signerOrder || 1);
    const label = defaultInputLabel(type, node.attrs.label);
    const width = normalizeInputFieldWidth(node.attrs.width);
    const widthCss = inputFieldWidthCss(width);
    // Editor: blank underline only — no type/name captions (those stay in data-* attrs)
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-esign-input-field": "1",
        class: "esign-input-field",
        style: `display:inline-block;vertical-align:baseline;width:${widthCss};max-width:100%;box-sizing:border-box;`,
        contenteditable: "false",
        title: `${label} (${type}) · Step ${order}`,
      }),
      ["span", { class: "esign-input-field__box" }, "____________"],
    ];
  },

  addCommands() {
    return {
      insertInputField:
        (attrs) =>
        ({ commands }) => {
          const fieldType = normalizeInputFieldType(attrs.fieldType);
          const label = defaultInputLabel(fieldType, attrs.label);
          const width = normalizeInputFieldWidth(attrs.width);
          return commands.insertContent({
            type: this.name,
            attrs: {
              fieldId:
                typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `if-${Date.now()}`,
              fieldType,
              label,
              signerOrder: Number(attrs.signerOrder || 1),
              required: attrs.required !== false,
              width,
            },
          });
        },
    };
  },
});

export function hydrateInputFields(
  html: string,
  fieldValues: Record<string, string>,
) {
  if (!html || !hasInlineInputFields(html)) return html;

  const doc = new DOMParser().parseFromString(
    `<div id="esign-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("esign-root");
  if (!root) return html;

  root.querySelectorAll("[data-esign-input-field]").forEach((node) => {
    const el = node as HTMLElement;
    const fieldId = el.getAttribute("data-field-id") || "";
    const type = normalizeInputFieldType(el.getAttribute("data-field-type"));
    const order = Number(el.getAttribute("data-signer-order") || 1);
    const width = normalizeInputFieldWidth(el.getAttribute("data-width"));
    const label =
      el.getAttribute("data-label")?.trim() || defaultInputLabel(type);
    const value = (fieldValues[fieldId] || "").trim();
    const shell = fieldShellHtml({
      label,
      order,
      type,
      width,
      value,
      filled: Boolean(value),
      showMeta: false,
    });

    let target = el;
    if (el.tagName === "DIV") {
      const span = doc.createElement("span");
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.toLowerCase() === "style") return;
        span.setAttribute(attr.name, attr.value);
      });
      el.parentNode?.replaceChild(span, el);
      target = span;
    }

    target.className = shell.className;
    target.setAttribute("style", shell.style);
    target.innerHTML = shell.inner;
  });

  return root.innerHTML;
}

export function inputFieldExportCss() {
  return `
    .esign-input-field {
      display: inline-block;
      vertical-align: baseline;
      margin: 2px 0;
      padding: 6px 0 2px;
      border: none;
      background: transparent;
      max-width: 100%;
      box-sizing: border-box;
      overflow: visible;
      line-height: 1.7;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    td .esign-input-field,
    th .esign-input-field {
      width: 100% !important;
      display: block;
    }
    .esign-input-field--filled {
      background: transparent;
    }
    .esign-input-field__title {
      display: none !important;
    }
    .esign-input-field__name {
      display: inline;
      margin-right: 0.4em;
      font-family: Georgia, 'Times New Roman', Times, serif;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.7;
      color: #0f172a;
    }
    .esign-input-field__box {
      display: inline-block;
      min-width: 8rem;
      min-height: 1.6em;
      border: none;
      border-bottom: 1px solid #64748b;
      padding: 2px 4px 1px;
      font-family: Georgia, 'Times New Roman', Times, serif;
      font-size: 13px;
      line-height: 1.7;
      color: #94a3b8;
      letter-spacing: 0.04em;
      white-space: normal;
      overflow: visible;
      vertical-align: baseline;
    }
    .esign-input-field__box--filled {
      color: #0f172a;
      font-weight: 600;
      letter-spacing: normal;
      border-bottom-color: #0f172a;
    }
  `;
}
