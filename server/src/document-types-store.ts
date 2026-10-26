import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DocumentTypeDefinition {
  id: string;
  name: string;
  description?: string;
  defaultTitle?: string;
  defaultContentHtml?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const dataFile = path.join(dataDir, "document-types.json");

const DEFAULT_TYPES: Array<Omit<DocumentTypeDefinition, "id" | "createdAt" | "updatedAt">> = [
  {
    name: "NDA",
    description: "Non-Disclosure Agreement",
    defaultTitle: "Employee NDA",
    defaultContentHtml: `<p><strong>NON-DISCLOSURE AGREEMENT (NDA)</strong></p>
<p>This Non-Disclosure Agreement is entered into between <strong>NEWEAST</strong> ("Company") and the undersigned Employee ("Recipient").</p>
<p><strong>1. Confidential Information</strong></p>
<p>The Recipient agrees to keep confidential all proprietary information, business data, customer lists, trade secrets, and internal processes disclosed by the Company.</p>
<p><strong>2. Obligations</strong></p>
<ul>
  <li>Not disclose confidential information to third parties</li>
  <li>Use confidential information only for authorized work purposes</li>
  <li>Return or securely destroy confidential materials upon request</li>
</ul>
<p><strong>3. Duration</strong></p>
<p>These obligations shall continue during employment and for a period of three (3) years thereafter.</p>
<p><strong>4. Acknowledgement</strong></p>
<p>By signing via E-Sign, both parties acknowledge they have read, understood, and agree to the terms of this agreement.</p>`,
    active: true,
  },
  {
    name: "Employment Contract",
    description: "Employment agreement",
    defaultTitle: "Employment Contract",
    active: true,
  },
  {
    name: "Offer Letter",
    description: "Job offer letter",
    defaultTitle: "Offer Letter",
    active: true,
  },
  {
    name: "Policy Acknowledgement",
    description: "Policy acknowledgement form",
    defaultTitle: "Policy Acknowledgement",
    active: true,
  },
  {
    name: "Other",
    description: "General document",
    defaultTitle: "Document",
    active: true,
  },
];

function ensureStore() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    const now = new Date().toISOString();
    const seeded = DEFAULT_TYPES.map((item) => ({
      ...item,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }));
    writeFileSync(dataFile, JSON.stringify(seeded, null, 2), "utf8");
  }
}

function readAll(): DocumentTypeDefinition[] {
  ensureStore();
  try {
    const parsed = JSON.parse(readFileSync(dataFile, "utf8")) as DocumentTypeDefinition[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: DocumentTypeDefinition[]) {
  ensureStore();
  writeFileSync(dataFile, JSON.stringify(items, null, 2), "utf8");
}

export function listDocumentTypes(options?: { activeOnly?: boolean }) {
  const items = readAll().sort((a, b) => a.name.localeCompare(b.name));
  if (options?.activeOnly) return items.filter((item) => item.active);
  return items;
}

export function createDocumentType(input: {
  name: string;
  description?: string;
  defaultTitle?: string;
  defaultContentHtml?: string;
  active?: boolean;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Document type name is required");

  const items = readAll();
  if (items.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("Document type already exists");
  }

  const now = new Date().toISOString();
  const created: DocumentTypeDefinition = {
    id: randomUUID(),
    name,
    description: input.description?.trim() || undefined,
    defaultTitle: input.defaultTitle?.trim() || undefined,
    defaultContentHtml: input.defaultContentHtml?.trim() || undefined,
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  items.push(created);
  writeAll(items);
  return created;
}

export function updateDocumentType(
  id: string,
  input: {
    name?: string;
    description?: string;
    defaultTitle?: string;
    defaultContentHtml?: string;
    active?: boolean;
  },
) {
  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const name = input.name?.trim() || items[index].name;
  if (
    items.some(
      (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error("Document type already exists");
  }

  items[index] = {
    ...items[index],
    name,
    description:
      input.description !== undefined
        ? input.description.trim() || undefined
        : items[index].description,
    defaultTitle:
      input.defaultTitle !== undefined
        ? input.defaultTitle.trim() || undefined
        : items[index].defaultTitle,
    defaultContentHtml:
      input.defaultContentHtml !== undefined
        ? input.defaultContentHtml.trim() || undefined
        : items[index].defaultContentHtml,
    active: input.active ?? items[index].active,
    updatedAt: new Date().toISOString(),
  };
  writeAll(items);
  return items[index];
}

export function deleteDocumentType(id: string) {
  const items = readAll();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  writeAll(next);
  return true;
}
