import { Loader2, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME } from "@/lib/branding";
import { assetUrl } from "@/lib/utils";

function MicrosoftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 23 23" className="h-4 w-4">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export default function LoginPage() {
  const { login, loginWithMicrosoft, isLoggingIn } = useAuth();
  const [showEmailFallback, setShowEmailFallback] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await login(email.trim(), name.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_0%_0%,#fff1f2,transparent_40%),radial-gradient(circle_at_100%_100%,#ecfdf5,transparent_35%),linear-gradient(160deg,#f8fafc,#ffffff_45%,#f1f5f9)] p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(90deg,rgba(220,38,38,0.08),transparent,rgba(16,185,129,0.08))]" />

      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#0f172a,#1e293b_55%,#7f1d1d)] p-10 text-white md:flex md:flex-col md:justify-between">
          <div>
            <img src={assetUrl("logo.png")} alt="NEWEAST" className="h-12 w-auto brightness-0 invert" />
            <p className="mt-8 text-xs font-semibold tracking-[0.22em] text-rose-200/90">
              {APP_NAME.toUpperCase()}
            </p>
            <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight">
              Sign documents.
              <br />
              Track every step.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
              Create NDAs and HR documents, collect signatures with {APP_NAME}, and follow
              recipient progress from one workspace.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            Sign in with your NEWEAST Microsoft 365 account. Intranet OTP links still
            work when you open {APP_NAME} from Intranet.
          </div>
        </aside>

        <div className="p-8 md:p-10">
          <div className="md:hidden">
            <img src={assetUrl("logo.png")} alt="NEWEAST" className="h-12 w-auto" />
          </div>
          <div className="mt-2 text-xs font-semibold tracking-[0.18em] text-red-600">
            HR PORTAL
          </div>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-slate-900">
            Sign in
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use your NEWEAST Microsoft account to access {APP_NAME}.
          </p>

          <Button
            type="button"
            className="mt-8 h-11 w-full"
            onClick={() => loginWithMicrosoft()}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MicrosoftIcon />
            )}
            {isLoggingIn ? "Redirecting..." : "Sign in with Microsoft"}
          </Button>

          <div className="mt-8">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
              onClick={() => setShowEmailFallback((v) => !v)}
            >
              {showEmailFallback ? "Hide email fallback" : "Continue with email instead"}
            </button>
          </div>

          {showEmailFallback ? (
            <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              <div className="space-y-2">
                <Label htmlFor="login-name">Full name (optional)</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="login-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="ps-9"
                    placeholder="Your name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-email">Work email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="ps-9"
                    placeholder="you@neweast.co"
                    required
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <Button type="submit" variant="outline" className="h-11 w-full" disabled={isLoggingIn}>
                {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue with email
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
