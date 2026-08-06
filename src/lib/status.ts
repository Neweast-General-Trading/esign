import type { DocumentStatus } from "./types";

export function statusTone(status: DocumentStatus) {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "hr_signed":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "sent":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "partially_signed":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
  }
}

export function statusDot(status: DocumentStatus) {
  switch (status) {
    case "draft":
      return "bg-slate-400";
    case "hr_signed":
      return "bg-blue-500";
    case "sent":
      return "bg-amber-500";
    case "partially_signed":
      return "bg-violet-500";
    case "completed":
      return "bg-emerald-500";
    case "cancelled":
      return "bg-red-500";
  }
}
