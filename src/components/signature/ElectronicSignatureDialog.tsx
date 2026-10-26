import { PenLine, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/branding";

export const SIGNATURE_FONT =
  "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive";

export function ElectronicSignaturePreview({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  if (!name.trim()) {
    return (
      <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-sm text-slate-400">
        Your signature preview will appear here
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-20 items-center justify-center rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white px-4 py-3",
        className,
      )}
    >
      <p
        className="break-words text-center text-3xl leading-tight text-blue-700"
        style={{ fontFamily: SIGNATURE_FONT }}
      >
        {name.trim()}
      </p>
    </div>
  );
}

interface ElectronicSignatureDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  defaultName?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (signatureText: string) => void;
}

export default function ElectronicSignatureDialog({
  open,
  title = APP_NAME,
  description = "Enter your full name below. Your signature will be generated and placed on the document via E-Sign.",
  confirmLabel = "Sign & Confirm",
  defaultName = "",
  isSubmitting = false,
  onClose,
  onConfirm,
}: ElectronicSignatureDialogProps) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Close signature dialog"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute end-4 top-4 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <PenLine className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500">Confirm your identity</p>
          </div>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-slate-600">{description}</p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="electronic-signature-name">Full name</Label>
            <Input
              id="electronic-signature-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Type your full name"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) onConfirm(name.trim());
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Generated signature</Label>
            <ElectronicSignaturePreview name={name} />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(name.trim())}
            disabled={isSubmitting || !name.trim()}
          >
            <PenLine className="h-4 w-4" />
            {isSubmitting ? "Signing..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
