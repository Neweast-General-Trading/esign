import { FileStack, FileText, LayoutDashboard, LogOut, Menu, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { cn } from "@/lib/utils";

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentPage: "dashboard" | "documents" | "create" | "view" | "document-types" | "configure-signatories";
  onNavigateDashboard: () => void;
  onNavigateDocuments: () => void;
  onNavigateCreate: () => void;
  onNavigateDocumentTypes: () => void;
}

export default function TopBar({
  onToggleSidebar,
  currentPage,
  onNavigateDashboard,
  onNavigateDocuments,
  onNavigateCreate,
  onNavigateDocumentTypes,
}: TopBarProps) {
  const { user, logout } = useAuth();

  const navButtonClass = (active: boolean) =>
    cn(
      "gap-2",
      active && "bg-red-50 text-red-700 hover:bg-red-50 hover:text-red-700",
    );

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <PenLine className="h-6 w-6 text-red-600" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{APP_NAME}</h1>
            <p className="hidden text-xs text-slate-500 sm:block">{APP_TAGLINE}</p>
          </div>
        </div>
        <nav className="ms-2 hidden items-center gap-1 md:flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={navButtonClass(currentPage === "dashboard")}
            onClick={onNavigateDashboard}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={navButtonClass(currentPage === "documents" || currentPage === "view")}
            onClick={onNavigateDocuments}
          >
            <FileText className="h-4 w-4" />
            Documents
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={navButtonClass(currentPage === "document-types")}
            onClick={onNavigateDocumentTypes}
          >
            <FileStack className="h-4 w-4" />
            Doc Types
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={navButtonClass(currentPage === "create")}
            onClick={onNavigateCreate}
          >
            <PenLine className="h-4 w-4" />
            New Document
          </Button>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 sm:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
            {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-900">{user?.name}</div>
            <div className="text-[11px] text-slate-500">{user?.email}</div>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => logout()}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </header>
  );
}
