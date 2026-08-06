import { Heart } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="z-50 w-full border-t border-slate-200 bg-white px-4 py-4 md:px-6">
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Made with</span>
          <Heart className="h-4 w-4 fill-red-600 text-red-600" />
          <span>by NEWEAST © {currentYear}</span>
        </div>
      </div>
    </footer>
  );
}
