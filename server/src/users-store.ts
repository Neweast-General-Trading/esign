import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: "hr" | "admin";
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const dataFile = path.join(dataDir, "users.json");

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function ensureStore() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    const now = new Date().toISOString();
    const defaults: AppUser[] = [
      {
        id: "user-sakour",
        email: "sakour@neweast.co",
        name: "Sakour",
        role: "admin",
        passwordHash: hashPassword("Esign@2026"),
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "user-hr",
        email: "hr@neweast.co",
        name: "HR Admin",
        role: "hr",
        passwordHash: hashPassword("Esign@2026"),
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    writeFileSync(dataFile, JSON.stringify(defaults, null, 2), "utf8");
  }
}

function readAll(): AppUser[] {
  ensureStore();
  try {
    const parsed = JSON.parse(readFileSync(dataFile, "utf8")) as AppUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function findUserByEmail(email: string) {
  const needle = email.trim().toLowerCase();
  return readAll().find((user) => user.email.toLowerCase() === needle) ?? null;
}

export function authenticateLocalUser(email: string, password: string) {
  const user = findUserByEmail(email);
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return {
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export function upsertMicrosoftUser(input: { email: string; name: string }) {
  ensureStore();
  const users = readAll();
  const email = input.email.trim().toLowerCase();
  const existing = users.find((user) => user.email === email);
  const now = new Date().toISOString();
  if (existing) {
    existing.name = input.name.trim() || existing.name;
    existing.updatedAt = now;
    existing.active = true;
    writeFileSync(dataFile, JSON.stringify(users, null, 2), "utf8");
    return { email: existing.email, name: existing.name, role: existing.role };
  }

  const created: AppUser = {
    id: `user-${randomBytes(6).toString("hex")}`,
    email,
    name: input.name.trim() || email.split("@")[0] || "HR User",
    role: "hr",
    passwordHash: hashPassword(randomBytes(12).toString("hex")),
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  users.push(created);
  writeFileSync(dataFile, JSON.stringify(users, null, 2), "utf8");
  return { email: created.email, name: created.name, role: created.role };
}
