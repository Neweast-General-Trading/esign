import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  FormInput,
  Italic,
  List,
  ListOrdered,
  PenLine,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  INPUT_FIELD_TYPES,
  INPUT_FIELD_WIDTHS,
  InputField,
  type InputFieldType,
  type InputFieldWidth,
} from "@/lib/input-fields";
import { SignatureField, type SignatureFieldRole } from "@/lib/signature-fields";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

const SIGNATORY_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write the document content...",
  className,
}: RichTextEditorProps) {
  const [signerOrder, setSignerOrder] = useState(1);
  const [fieldRole, setFieldRole] = useState<SignatureFieldRole>("signatory");
  const [inputType, setInputType] = useState<InputFieldType>("text");
  const [fieldLabel, setFieldLabel] = useState("");
  const [inputWidth, setInputWidth] = useState<InputFieldWidth>("md");
  const [inputSignerOrder, setInputSignerOrder] = useState(1);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      SignatureField,
      InputField,
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && value !== undefined) {
      editor.commands.setContent(value || "", false);
    }
  }, [editor, value]);

  if (!editor) return null;

  const insertSignature = () => {
    editor
      .chain()
      .focus()
      .insertSignatureField({
        role: fieldRole,
        signerOrder: fieldRole === "company" ? 0 : signerOrder,
      })
      .run();
  };

  const insertInput = () => {
    const label = fieldLabel.trim();
    if (!label) return;
    editor
      .chain()
      .focus()
      .insertInputField({
        fieldType: inputType,
        label,
        signerOrder: inputSignerOrder,
        width: inputWidth,
        required: true,
      })
      .run();
  };

  return (
    <div
      className={cn(
        "flex max-h-[min(72vh,720px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white",
        className,
      )}
    >
      <div className="shrink-0 space-y-2 border-b border-slate-200 bg-slate-50/95 p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1.5">
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("bold") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("italic") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("underline") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Signature fields
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={fieldRole}
              onChange={(e) => setFieldRole(e.target.value as SignatureFieldRole)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-red-300"
            >
            <option value="signatory">Signatory field</option>
            <option value="company">Company / HR field (only if company signs)</option>
          </select>
          {fieldRole === "signatory" ? (
            <select
              value={signerOrder}
              onChange={(e) => setSignerOrder(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-red-300"
            >
              {SIGNATORY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Step {n}
                </option>
              ))}
            </select>
          ) : null}
            <Button type="button" size="sm" variant="outline" onClick={insertSignature}>
              <PenLine className="h-3.5 w-3.5" />
              Insert signature
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Insert field (filled by signer)
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              placeholder="Field name (e.g. Employee ID)"
              className="h-8 w-52 text-xs"
            />
            <select
              value={inputType}
              onChange={(e) => setInputType(e.target.value as InputFieldType)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-red-300"
              aria-label="Field type"
            >
              {INPUT_FIELD_TYPES.map((preset) => (
                <option key={preset.type} value={preset.type}>
                  {preset.label}
                </option>
              ))}
            </select>
            <select
              value={inputWidth}
              onChange={(e) => setInputWidth(e.target.value as InputFieldWidth)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-red-300"
              aria-label="Field width"
            >
              {INPUT_FIELD_WIDTHS.map((w) => (
                <option key={w.id} value={w.id}>
                  Width: {w.label}
                </option>
              ))}
            </select>
            <select
              value={inputSignerOrder}
              onChange={(e) => setInputSignerOrder(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-red-300"
              aria-label="Signing step"
            >
              {SIGNATORY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Fill by Step {n}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={insertInput}
              disabled={!fieldLabel.trim()}
            >
              <FormInput className="h-3.5 w-3.5" />
              Insert field
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            Name the field, choose Text / Number / Date, set width, then insert. Assign{" "}
            <strong>Fill by Step N</strong> to match the signing step (Step 1 = Employees, Step 2 =
            Manager, …) — not the individual person number.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
