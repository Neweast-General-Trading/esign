import type { NextFunction, Request, Response } from "express";
import { verifyAppToken, type AuthUser } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.user = verifyAppToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}
