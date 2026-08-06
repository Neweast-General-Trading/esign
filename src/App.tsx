import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import DocumentsSidebar from "@/components/layout/DocumentsSidebar";
import Footer from "@/components/layout/Footer";
import TopBar from "@/components/layout/TopBar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthContext";
import { fetchDocuments } from "@/lib/api";
import type { SignDocument } from "@/lib/types";
import CreateDocumentPage from "@/pages/CreateDocumentPage";
import DashboardPage from "@/pages/DashboardPage";
import DocumentTypesPage from "@/pages/DocumentTypesPage";
import DocumentViewPage from "@/pages/DocumentViewPage";
import DocumentsListPage from "@/pages/DocumentsListPage";
import LoginPage from "@/pages/LoginPage";
import SignPage from "@/pages/SignPage";

type AppPage = "dashboard" | "documents" | "create" | "view" | "document-types";

function readDocIdFromUrl() {
  return new URLSearchParams(window.location.search).get("doc");
}

function setDocUrl(docId: string | null) {
  const url = new URL(window.location.href);
  if (docId) url.searchParams.set("doc", docId);
  else url.searchParams.delete("doc");
  window.history.replaceState({}, "", url.toString());
}

function readSignToken() {
  const match = window.location.pathname.match(/\/sign\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

export default function App() {
  const queryClient = useQueryClient();
  const { isAuthenticated, isBootstrapping } = useAuth();
  const signToken = readSignToken();

  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [page, setPage] = useState<AppPage>("dashboard");
  const [selected, setSelected] = useState<SignDocument | null>(null);
  const [editing, setEditing] = useState(false);

  const {
    data: documents = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
    enabled: isAuthenticated && !signToken,
  });

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : "Failed to load documents");
  }, [error]);

  useEffect(() => {
    if (!isAuthenticated || isLoading || signToken) return;
    const docId = readDocIdFromUrl();
    if (!docId) return;
    const found = documents.find((item) => item.id === docId);
    if (found) {
      setSelected(found);
      setPage("view");
      setEditing(false);
    }
  }, [isAuthenticated, isLoading, documents, signToken]);

  if (signToken) {
    return <SignPage token={signToken} />;
  }

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Toaster richColors position="top-right" />
        <LoginPage />
      </>
    );
  }

  const openDocument = (doc: SignDocument) => {
    setSelected(doc);
    setPage("view");
    setEditing(false);
    setDocUrl(doc.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const goDashboard = () => {
    setSelected(null);
    setEditing(false);
    setPage("dashboard");
    setDocUrl(null);
  };

  const goDocuments = () => {
    setSelected(null);
    setEditing(false);
    setPage("documents");
    setDocUrl(null);
  };

  const goCreate = () => {
    setSelected(null);
    setEditing(false);
    setPage("create");
    setDocUrl(null);
  };

  const goDocumentTypes = () => {
    setSelected(null);
    setEditing(false);
    setPage("document-types");
    setDocUrl(null);
  };

  const handleSaved = async (doc: SignDocument) => {
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    setSelected(doc);
    setEditing(false);
    setPage("view");
    setDocUrl(doc.id);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Toaster richColors position="top-right" />
      <div className="flex flex-1">
        <DocumentsSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          documents={documents}
          isLoading={isLoading}
          selectedId={selected?.id ?? null}
          onSelect={openDocument}
          onCreateNew={goCreate}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
            currentPage={page}
            onNavigateDashboard={goDashboard}
            onNavigateDocuments={goDocuments}
            onNavigateCreate={goCreate}
            onNavigateDocumentTypes={goDocumentTypes}
          />

          <ScrollArea className="app-page h-[calc(100vh-64px)]">
            <div className="w-full p-4 md:p-6 lg:p-8">
              {page === "dashboard" && (
                <DashboardPage
                  onCreateNew={goCreate}
                  onOpenDocument={openDocument}
                  onBrowseDocuments={goDocuments}
                />
              )}

              {page === "documents" && (
                <DocumentsListPage
                  documents={documents}
                  onBack={goDashboard}
                  onOpen={openDocument}
                />
              )}

              {page === "document-types" && (
                <DocumentTypesPage onBack={goDashboard} />
              )}

              {page === "create" && (
                <CreateDocumentPage onCancel={goDashboard} onSaved={(doc) => void handleSaved(doc)} />
              )}

              {page === "view" && selected && editing && (
                <CreateDocumentPage
                  initialDocument={selected}
                  onCancel={() => setEditing(false)}
                  onSaved={(doc) => void handleSaved(doc)}
                />
              )}

              {page === "view" && selected && !editing && (
                <DocumentViewPage
                  document={selected}
                  onUpdated={(doc) => {
                    setSelected(doc);
                    void queryClient.invalidateQueries({ queryKey: ["documents"] });
                    void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
                  }}
                  onDeleted={() => {
                    void queryClient.invalidateQueries({ queryKey: ["documents"] });
                    void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
                    goDashboard();
                  }}
                  onEdit={() => setEditing(true)}
                />
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
      <Footer />
    </div>
  );
}
