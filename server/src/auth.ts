import jwt from "jsonwebtoken";

export interface AuthUser {
  email: string;
  name: string;
  role?: string;
}

function getJwtSecret() {
  const secret = process.env.APP_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("APP_JWT_SECRET is not configured");
  }
  return secret;
}

export function signAppToken(user: AuthUser) {
  return jwt.sign(user, getJwtSecret(), { expiresIn: "12h" });
}

export function verifyAppToken(token: string): AuthUser {
  const payload = jwt.verify(token, getJwtSecret()) as AuthUser;
  return {
    email: payload.email,
    name: payload.name,
    role: payload.role,
  };
}
