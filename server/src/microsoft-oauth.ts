import { createHash, randomBytes } from "node:crypto";

interface PendingLogin {
  verifier: string;
  returnTo: string;
  expiresAt: number;
  silent?: boolean;
}

const pendingLogins = new Map<string, PendingLogin>();

const TENANT_ID =
  process.env.AZURE_TENANT_ID?.trim() || "49398592-1c41-4c6f-b59c-7efea4675def";
const CLIENT_ID =
  process.env.AZURE_CLIENT_ID?.trim() || "1b7c74bc-8564-4585-8f4c-40b51f2d6d60";
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET?.trim() || "";
const REDIRECT_URI = (
  process.env.AZURE_REDIRECT_URI?.trim() ||
  "https://esign.neweast.cloud/api/auth/microsoft/callback"
).replace(/\/$/, "");
const SCOPES = (process.env.AZURE_SCOPES || "openid profile email User.Read")
  .split(/\s+/)
  .filter(Boolean);

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair() {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of pendingLogins.entries()) {
    if (value.expiresAt <= now) pendingLogins.delete(key);
  }
}

export function sanitizeReturnTo(returnTo?: string) {
  const fallback = process.env.CLIENT_URL?.trim() || "https://esign.neweast.cloud/";
  if (!returnTo?.trim()) {
    return fallback.endsWith("/") ? fallback : `${fallback}/`;
  }
  try {
    const url = new URL(returnTo);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function storeMicrosoftLogin(returnTo: string, silent = false) {
  cleanupExpired();
  const state = base64UrlEncode(randomBytes(24));
  const { verifier, challenge } = createPkcePair();
  pendingLogins.set(state, {
    verifier,
    returnTo: sanitizeReturnTo(returnTo),
    expiresAt: Date.now() + 10 * 60 * 1000,
    silent,
  });
  return { state, challenge };
}

export function consumeMicrosoftLogin(state: string) {
  cleanupExpired();
  const entry = pendingLogins.get(state);
  if (!entry) return null;
  pendingLogins.delete(state);
  return entry;
}

export function buildMicrosoftLoginUrl(
  returnTo: string,
  options?: { silent?: boolean; loginHint?: string },
) {
  const silent = options?.silent ?? false;
  const { state, challenge } = storeMicrosoftLogin(returnTo, silent);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: silent ? "none" : "select_account",
  });
  if (options?.loginHint?.trim()) {
    params.set("login_hint", options.loginHint.trim());
  }
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code: string, verifier: string) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    scope: SCOPES.join(" "),
  });
  if (CLIENT_SECRET) body.set("client_secret", CLIENT_SECRET);

  const response = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Microsoft token exchange failed");
  }
  return data.access_token;
}

export async function fetchMicrosoftProfile(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json()) as {
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to load Microsoft profile");
  }
  const email = (data.mail || data.userPrincipalName || "").trim().toLowerCase();
  if (!email) throw new Error("Microsoft account has no email");
  return {
    email,
    name: (data.displayName || email.split("@")[0] || "HR User").trim(),
  };
}

export async function completeMicrosoftLogin(code: string, state: string) {
  const pending = consumeMicrosoftLogin(state);
  if (!pending) throw new Error("Login session expired — please try again");
  const accessToken = await exchangeCodeForToken(code, pending.verifier);
  const profile = await fetchMicrosoftProfile(accessToken);
  return { profile, returnTo: pending.returnTo };
}

export function buildLoginErrorRedirect(message: string, returnTo?: string) {
  const url = new URL(sanitizeReturnTo(returnTo));
  url.searchParams.set("loginError", String(message || "Login failed").slice(0, 240));
  return url.toString();
}
