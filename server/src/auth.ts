import jwt from "jsonwebtoken";

export type AuthSource = "intranet" | "microsoft" | "open";

export interface AuthUser {
  email: string;
  name: string;
  role?: string;
  authSource?: AuthSource;
}

function getJwtSecret() {
  const secret = process.env.APP_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("APP_JWT_SECRET is not configured");
  }
  return secret;
}

export function signAppToken(
  user: AuthUser,
  authSource: AuthSource = user.authSource ?? "open",
) {
  return jwt.sign({ ...user, authSource }, getJwtSecret(), { expiresIn: "12h" });
}

export function verifyAppToken(token: string): AuthUser {
  const payload = jwt.verify(token, getJwtSecret()) as AuthUser;
  return {
    email: payload.email,
    name: payload.name,
    role: payload.role,
    authSource: payload.authSource,
  };
}

/** Accept a JWT signed with the shared APP_JWT_SECRET (Intranet) and issue a fresh E-Sign session. */
export function exchangeSharedAppToken(token: string) {
  const payload = verifyAppToken(token);
  const email = payload.email?.trim();
  if (!email) throw new Error("Invalid token payload");

  const user: AuthUser = {
    email,
    name: payload.name?.trim() || email,
    role: payload.role || "hr",
    authSource: "intranet",
  };

  return { user, token: signAppToken(user, "intranet") };
}
