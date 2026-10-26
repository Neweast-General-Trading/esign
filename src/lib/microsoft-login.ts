export const SSO_ATTEMPT_KEY = "e_sign_sso_attempted";

export function consumeAuthRedirect(): {
  token: string;
  user: { email: string; name: string };
} | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const token = params.get("token")?.trim();
  if (!token) return null;

  const user = {
    email: params.get("email")?.trim() || "",
    name: params.get("name")?.trim() || "",
  };

  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return { token, user };
}

export function consumeTokenFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token")?.trim() || params.get("jwt")?.trim();
  if (!token) return null;

  params.delete("token");
  params.delete("jwt");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
  return token;
}

export function readLoginErrorFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const message = params.get("loginError")?.trim();
  if (!message) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return message;
}

export function isIntranetReferrer() {
  const referrer = document.referrer.trim();
  if (!referrer) return false;
  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    return (
      hostname === "mis.neweast.cloud" ||
      hostname.endsWith(".mis.neweast.cloud") ||
      hostname.includes("intranet")
    );
  } catch {
    return false;
  }
}

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

/** Prefer the dedicated esign host for OAuth so Azure redirect URI always matches. */
const MICROSOFT_LOGIN_BASE =
  import.meta.env.VITE_MS_LOGIN_BASE ||
  (typeof window !== "undefined" &&
  window.location.hostname.endsWith("neweast.cloud")
    ? "https://esign.neweast.cloud/api"
    : API_BASE);

export function startMicrosoftLogin(options?: {
  silent?: boolean;
  returnTo?: string;
  loginHint?: string;
}) {
  const params = new URLSearchParams({
    returnTo:
      options?.returnTo ??
      `${window.location.origin}${window.location.pathname}${window.location.search}`,
  });
  if (options?.silent) params.set("silent", "1");
  if (options?.loginHint?.trim()) params.set("login_hint", options.loginHint.trim());
  window.location.href = `${MICROSOFT_LOGIN_BASE}/auth/microsoft/login?${params.toString()}`;
}
