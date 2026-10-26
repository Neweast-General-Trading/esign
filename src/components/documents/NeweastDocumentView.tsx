import { ElectronicSignaturePreview } from "@/components/signature/ElectronicSignatureDialog";
import type { SignDocument } from "@/lib/types";
import {
  GENERATED_BY_LABEL,
  OFFICIAL_DOCUMENT_LABEL,
  SIGNED_VIA_LABEL,
} from "@/lib/branding";
import {
  hasCompanySignatureField,
  hasInlineSignatureFields,
  hydrateSignatureFields,
} from "@/lib/signature-fields";
import {
  collectFieldValues,
  hydrateInputFields,
} from "@/lib/input-fields";
import { compactSignerOrdersInHtml } from "@/lib/signer-order";
import { assetUrl, formatDateTime } from "@/lib/utils";

interface NeweastDocumentViewProps {
  document: Pick<
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
  showSignatures?: boolean;
  /** Live values while the current signer is filling the form */
  draftFieldValues?: Record<string, string>;
}

export default function NeweastDocumentView({
  document,
  showSignatures = true,
  draftFieldValues,
}: NeweastDocumentViewProps) {
  const employeeSignatures = document.recipients.filter((r) => r.status === "signed");
  const ref = document.id.slice(0, 8).toUpperCase();
  const contentHtml = compactSignerOrdersInHtml(document.contentHtml);
  const inlineFields = hasInlineSignatureFields(contentHtml);
  const showCompanyBlock =
    Boolean(document.includeCompanySignature) ||
    Boolean(document.hrSignature) ||
    hasCompanySignatureField(contentHtml);
  const mergedValues = {
    ...collectFieldValues(document.recipients),
    ...(draftFieldValues || {}),
  };
  const bodyHtml = hydrateInputFields(
    hydrateSignatureFields(contentHtml, {
      recipients: document.recipients,
      hrSignature: document.hrSignature,
    }),
    mergedValues,
  );
  const showFooterSignatures = showSignatures && !inlineFields;

  return (
    <article className="neweast-document mx-auto max-w-[794px] overflow-hidden border border-slate-200 bg-white shadow-[0_18px_50px_-36px_rgba(15,23,42,0.4)]">
      <div className="px-8 pb-7 pt-8 md:px-11">
        <div className="mb-3.5 flex items-center justify-between gap-4">
          <img
            src={assetUrl("logo.png")}
            alt="NEWEAST"
            className="h-12 w-auto object-contain"
          />
          <div className="text-end">
            <div className="text-[13px] font-bold tracking-wide text-red-900">
              NEWEAST GENERAL TRADING
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              {OFFICIAL_DOCUMENT_LABEL}
            </div>
          </div>
        </div>

        <div className="mb-0.5 h-[3px] bg-red-900" />
        <div className="mb-5 h-px bg-slate-300" />

        <h1 className="mb-5 font-sans text-lg font-bold leading-snug tracking-tight text-slate-900">
          {document.title}
        </h1>

        <div
          className="doc-content font-serif text-[13.5px] leading-relaxed text-slate-800"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {showFooterSignatures ? (
          <>
            <div className="mb-4 mt-8 h-px bg-slate-200" />
            <div className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
              Signatures
            </div>
            <div className={showCompanyBlock ? "grid gap-8 sm:grid-cols-2" : "grid gap-8"}>
              {showCompanyBlock ? (
              <div>
                <div className="mb-2 font-sans text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  For the Company / HR
                </div>
                {document.hrSignature ? (
                  <>
                    <div className="border-b border-slate-900 pb-1">
                      <ElectronicSignaturePreview
                        name={document.hrSignature.name}
                        className="min-h-14 border-0 bg-transparent from-transparent to-transparent px-0"
                      />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                      <strong className="text-slate-800">{document.hrSignature.name}</strong>
                      <br />
                      Signed {formatDateTime(document.hrSignature.signedAt)}
                      <br />
                      <span className="text-[10px] text-slate-400">
                        {SIGNED_VIA_LABEL}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-2 h-11 border-b border-slate-300" />
                    <p className="text-[11px] text-slate-400">Awaiting company signature</p>
                  </>
                )}
              </div>
              ) : null}

              <div>
                <div className="mb-2 font-sans text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {showCompanyBlock
                    ? `Employee${employeeSignatures.length > 1 ? "s" : ""}`
                    : `Signator${employeeSignatures.length === 1 ? "y" : "ies"}`}
                </div>
                {employeeSignatures.length === 0 ? (
                  <>
                    <div className="mb-2 h-11 border-b border-slate-300" />
                    <p className="text-[11px] text-slate-400">Awaiting signature</p>
                  </>
                ) : (
                  <div className="space-y-5">
                    {employeeSignatures.map((r) => (
                      <div key={r.id}>
                        <div className="border-b border-slate-900 pb-1">
                          <ElectronicSignaturePreview
                            name={r.signatureName || r.name}
                            className="min-h-14 border-0 bg-transparent from-transparent to-transparent px-0"
                          />
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                          <strong className="text-slate-800">{r.name}</strong>
                          {r.signedAt ? (
                            <>
                              <br />
                              Signed {formatDateTime(r.signedAt)}
                            </>
                          ) : null}
                          <br />
                          <span className="text-[10px] text-slate-400">
                            {SIGNED_VIA_LABEL}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}

        {inlineFields && showSignatures ? (
          <p className="mt-6 text-center font-sans text-[10px] text-slate-400">
            Signatures appear in the placed fields above.
          </p>
        ) : null}

        <footer className="mt-8 border-t border-slate-200 pt-3 text-center font-sans text-[9px] leading-relaxed text-slate-400">
          {GENERATED_BY_LABEL}
          {document.completedAt ? ` · Completed ${formatDateTime(document.completedAt)}` : ""}
          {" · "}
          Ref ES-{ref}
          {" · "}© {new Date().getFullYear()} Neweast Trading
        </footer>
      </div>
    </article>
  );
}
