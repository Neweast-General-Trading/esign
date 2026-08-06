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

export function readLoginErrorFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const message = params.get("loginError")?.trim();
  if (!message) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return message;
}

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
  window.location.href = `/api/auth/microsoft/login?${params.toString()}`;
}
