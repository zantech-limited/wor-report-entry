import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { Pool } from "pg";
import mysql from "mysql2/promise";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { dataDirectory, readConfig, database } from "./storage";

export const ROLES = ["tech", "supervisor", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const accountsEnabled = () =>
  !!process.env.VERCEL || process.env.DESK_ACCOUNTS_ENABLED !== "false";
export function accountSecret() {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32)
    return process.env.AUTH_SECRET;
  if (process.env.VERCEL)
    throw new Error("Configure AUTH_SECRET with at least 32 characters.");
  mkdirSync(dataDirectory, { recursive: true });
  const file = path.join(dataDirectory, "account-secret");
  if (!existsSync(file)) {
    try {
      writeFileSync(file, randomBytes(48).toString("hex"), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (!existsSync(file)) throw error;
    }
  }
  return readFileSync(file, "utf8").trim();
}
export function makeAuth(config = readConfig()) {
  const connection =
    config.engine === "sqlite"
      ? new Database(path.join(dataDirectory, "reports.sqlite"))
      : config.engine === "mysql"
        ? mysql.createPool({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectionLimit: 2,
            ssl: config.tls
              ? { rejectUnauthorized: true, ca: config.ca || undefined }
              : undefined,
          })
        : new Pool({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            max: 2,
            ssl: config.tls
              ? { rejectUnauthorized: true, ca: config.ca || undefined }
              : undefined,
          });
  const baseURL =
    process.env.APP_URL ||
    (!process.env.VERCEL ? "http://localhost:43123" : undefined);
  if (process.env.VERCEL && (!baseURL || !baseURL.startsWith("https://")))
    throw new Error("Configure APP_URL as the deployed HTTPS origin.");
  return betterAuth({
    appName: "Zantech Service Desk",
    baseURL,
    secret: accountSecret(),
    database: connection,
    trustedOrigins: baseURL ? [baseURL] : [],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const { sendAccountMail } = await import("./smtp");
        await sendAccountMail(
          user.email,
          "Reset your service desk password",
          url,
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, url }) => {
        const { sendAccountMail } = await import("./smtp");
        await sendAccountMail(
          user.email,
          "Verify your service desk email",
          url,
        );
      },
    },
    user: {
      modelName: "desk_user",
      additionalFields: {
        role: { type: "string", defaultValue: "tech", input: false },
        status: { type: "string", defaultValue: "pending", input: false },
        technicianName: { type: "string", defaultValue: "", input: false },
      },
    },
    session: {
      modelName: "desk_session",
      expiresIn: 60 * 60 * 8,
      cookieCache: { enabled: false },
    },
    account: { modelName: "desk_account" },
    verification: { modelName: "desk_verification" },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "desk_rate_limit",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 3600, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: baseURL?.startsWith("https://") ?? !!process.env.VERCEL,
    },
  });
}
type DeskAuth = ReturnType<typeof makeAuth>;
const globalAuth = globalThis as unknown as { deskAuth?: DeskAuth };
export function auth() {
  return (globalAuth.deskAuth ??= makeAuth());
}
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  technicianName: string;
};
export async function currentActor(headers: Headers): Promise<Actor | null> {
  if (!accountsEnabled())
    return {
      id: "local-legacy",
      name: "Local administrator",
      email: "",
      role: "admin",
      status: "active",
      technicianName: "",
    };
  const db = await database();
  const ready = await db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("accounts-ready");
  if (!ready) return null;
  const session = await auth().api.getSession({ headers });
  if (!session) return null;
  const user = session.user;
  if (user.status !== "active" || !ROLES.includes(user.role as Role))
    return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    status: user.status,
    technicianName: user.technicianName,
  };
}
