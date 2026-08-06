import { ElectronicSignaturePreview } from "@/components/signature/ElectronicSignatureDialog";
import type { SignDocument } from "@/lib/types";
import { assetUrl, formatDateTime } from "@/lib/utils";

interface NeweastDocumentViewProps {
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
  >;
  showSignatures?: boolean;
}

export default function NeweastDocumentView({
  document,
  showSignatures = true,
}: NeweastDocumentViewProps) {
  const employeeSignatures = document.recipients.filter((r) => r.status === "signed");

  return (
    <article className="neweast-document mx-auto max-w-[780px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-red-700 via-red-600 to-rose-500 px-6 py-4 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-90">
              NEWEAST E-Sign Document
            </div>
            <h1 className="mt-1 text-xl font-bold leading-snug">{document.title}</h1>
            <p className="mt-1 text-xs text-white/85">
              {document.documentType} · Prepared by {document.createdByName}
            </p>
          </div>
          <img
            src={assetUrl("logo.png")}
            alt="NEWEAST"
            className="h-10 w-auto rounded bg-white/95 p-1.5 object-contain"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3 text-[11px] text-slate-600">
        <div>
          <div className="font-semibold text-slate-400">Document Type</div>
          <div className="mt-0.5 font-medium text-slate-800">{document.documentType}</div>
        </div>
        <div>
          <div className="font-semibold text-slate-400">Created</div>
          <div className="mt-0.5 font-medium text-slate-800">
            {formatDateTime(document.createdAt)}
          </div>
        </div>
        <div>
          <div className="font-semibold text-slate-400">Status</div>
          <div className="mt-0.5 font-medium capitalize text-slate-800">
            {document.status.replaceAll("_", " ")}
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <div
          className="doc-content text-[14px] leading-relaxed text-slate-700"
          dangerouslySetInnerHTML={{ __html: document.contentHtml }}
        />
      </div>

      {showSignatures ? (
        <div className="border-t border-slate-200 px-6 py-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            Electronic Signatures
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                HR / Company
              </div>
              {document.hrSignature ? (
                <>
                  <ElectronicSignaturePreview name={document.hrSignature.name} />
                  <p className="mt-2 text-[11px] text-slate-500">
                    {document.hrSignature.name}
                    <br />
                    Signed {formatDateTime(document.hrSignature.signedAt)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Awaiting HR signature</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Employee(s)
              </div>
              {employeeSignatures.length === 0 ? (
                <p className="text-sm text-slate-400">Awaiting employee signatures</p>
              ) : (
                <div className="space-y-3">
                  {employeeSignatures.map((r) => (
                    <div key={r.id}>
                      <ElectronicSignaturePreview name={r.signatureName || r.name} />
                      <p className="mt-1 text-[11px] text-slate-500">
                        {r.name}
                        {r.signedAt ? (
                          <>
                            <br />
                            Signed {formatDateTime(r.signedAt)}
                          </>
                        ) : null}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-center text-[10px] text-slate-400">
        Official NEWEAST E-Sign Document
        {document.completedAt ? ` · Completed ${formatDateTime(document.completedAt)}` : ""}
        {" · "}© {new Date().getFullYear()} Neweast Trading
      </footer>
    </article>
  );
}
