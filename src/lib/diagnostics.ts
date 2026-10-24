import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { allowAttempt, forgetAttemptMemory, resetAttemptBuckets } from "./attempt-limit";
import packageInfo from "../../package.json";
import { readConfig, Storage, type StorageConfig } from "./storage";
import type {
  DiagnosticConnection,
  DiagnosticReport,
  EnvCheck,
  EnvStatus,
  Presence,
  ProbeResult,
} from "./diagnostics-types";

export const diagnosticsCookie = "desk-diagnostics";
const sessionMs = 30 * 60 * 1000;
const requiredEnv = [
  "APP_URL",
  "AUTH_SECRET",
  "ADMIN_TOKEN",
  "CRON_SECRET",
  "DB_ENGINE",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_TLS",
] as const;
const optionalEnv = ["DB_CODE", "DB_SSL_CA"] as const;
const secretEnv = [
  "ADMIN_TOKEN",
  "AUTH_SECRET",
  "CRON_SECRET",
  "DB_PASSWORD",
  "DB_USER",
  "DB_NAME",
  "DB_SSL_CA",
  "DB_CODE",
  "MYSQL_PASSWORD",
  "MYSQL_ROOT_PASSWORD",
  "POSTGRES_PASSWORD",
];

function envValue(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value : "";
}

export function adminTokenConfigured() {
  return envValue("ADMIN_TOKEN").length > 0;
}

/** Hash both sides so different lengths still compare in constant time. */
export function fixedEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function diagnosticsAuthorized(presented: string) {
  if (!adminTokenConfigured()) return false;
  return fixedEqual(presented, envValue("ADMIN_TOKEN"));
}

function sign(value: string) {
  return createHmac("sha256", envValue("ADMIN_TOKEN")).update(value).digest("hex");
}

export function diagnosticsSessionValue(now = Date.now()) {
  const expires = String(now + sessionMs);
  return `${expires}.${sign(`desk-diagnostics:${expires}`)}`;
}

export function diagnosticsSessionValid(cookieHeader: string | null, now = Date.now()) {
  if (!adminTokenConfigured() || !cookieHeader) return false;
  const raw = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${diagnosticsCookie}=`))
    ?.slice(diagnosticsCookie.length + 1);
  if (!raw) return false;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  const dot = decoded.indexOf(".");
  if (dot < 1) return false;
  const expires = decoded.slice(0, dot);
  const signature = decoded.slice(dot + 1);
  const expiry = Number(expires);
  if (!/^\d+$/.test(expires) || !Number.isFinite(expiry) || expiry <= now) return false;
  return fixedEqual(signature, sign(`desk-diagnostics:${expires}`));
}

export function diagnosticsCookieOptions(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto");
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure:
      forwarded === "https" ||
      new URL(request.url).protocol === "https:" ||
      envValue("VERCEL") === "1",
    path: "/",
    maxAge: Math.floor(sessionMs / 1000),
  };
}

const diagnosticsBuckets = ["diagnostics-auth", "diagnostics-probe"] as const;

export function forgetDiagnosticsMemory() {
  forgetAttemptMemory();
}

export async function resetDiagnosticsAttempts() {
  await resetAttemptBuckets([...diagnosticsBuckets]);
}

export function mayAttemptDiagnosticsAuth() {
  return allowAttempt("diagnostics-auth", 8);
}

export function mayAttemptDiagnosticsProbe() {
  return allowAttempt("diagnostics-probe", 10);
}

function envStatus(name: string): EnvStatus {
  const value = envValue(name);
  if (!value) return "missing";
  if (name === "AUTH_SECRET" && value.length < 32) return "too short";
  if (name === "ADMIN_TOKEN" && value.length < 24) return "too short";
  if (name === "APP_URL" && envValue("VERCEL") && !value.startsWith("https://"))
    return "not https";
  if (name === "DB_ENGINE" && !["sqlite", "mysql", "postgres", "supabase"].includes(value))
    return "invalid";
  if (name === "DB_PORT" && !/^\d{1,5}$/.test(value)) return "invalid";
  if (name === "DB_PORT" && (Number(value) < 1 || Number(value) > 65535)) return "invalid";
  if (name === "DB_TLS" && value !== "true" && value !== "false") return "invalid";
  return "set";
}

function environmentChecks(): EnvCheck[] {
  return [
    ...requiredEnv.map((name) => ({ name, required: true, status: envStatus(name) })),
    ...optionalEnv.map((name) => ({ name, required: false, status: envStatus(name) })),
  ];
}

function presence(value: string): Presence {
  return value ? "set" : "missing";
}

function safeHost(host: string, password: string) {
  if (!host) return "not set";
  if (host.includes("://") || /[@/?\s]/.test(host) || host.length > 253) return "[redacted]";
  if (password.length >= 4 && host.includes(password)) return "[redacted]";
  return host;
}

function publicEngine(value: string) {
  if (!value) return "not set";
  return ["sqlite", "mysql", "postgres", "supabase"].includes(value) ? value : "invalid";
}

function publicPort(value: string, engine: string) {
  if (engine === "sqlite") return "not used";
  if (!value) return "not set";
  if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    return "invalid";
  return String(Number(value));
}

function publicTls(value: string, engine: string) {
  if (engine === "sqlite") return "not used";
  if (!value) return "not set";
  if (value === "true") return "on";
  if (value === "false") return "off";
  return "invalid";
}

function connectionFromEnv(configError?: string): DiagnosticConnection {
  const engine = publicEngine(envValue("DB_ENGINE"));
  return {
    source: "unavailable",
    engine,
    host: engine === "sqlite" ? "local file" : safeHost(envValue("DB_HOST"), envValue("DB_PASSWORD")),
    port: publicPort(envValue("DB_PORT"), engine === "invalid" ? "" : engine),
    tls: publicTls(envValue("DB_TLS"), engine === "invalid" ? "" : engine),
    username: engine === "sqlite" ? "not used" : presence(envValue("DB_USER")),
    database: engine === "sqlite" ? "not used" : presence(envValue("DB_NAME")),
    password: engine === "sqlite" ? "not used" : presence(envValue("DB_PASSWORD")),
    databaseCode: presence(envValue("DB_CODE")),
    certificate: presence(envValue("DB_SSL_CA")),
    ...(configError ? { configError } : {}),
  };
}

function connectionFromConfig(config: StorageConfig): DiagnosticConnection {
  if (config.engine === "sqlite") {
    return {
      source: "resolved",
      engine: "sqlite",
      host: "local file",
      port: "not used",
      tls: "not used",
      username: "not used",
      database: "not used",
      password: "not used",
      databaseCode: config.databaseCode ? "set" : "missing",
      certificate: "not used",
    };
  }
  return {
    source: "resolved",
    engine: config.engine,
    host: safeHost(config.host, config.password),
    port: String(config.port),
    tls: config.tls ? "on" : "off",
    username: presence(config.username),
    database: presence(config.database),
    password: presence(config.password),
    databaseCode: config.databaseCode ? "set" : "missing",
    certificate: config.ca ? "set" : "missing",
  };
}

function bounded(value: string, fallback: string, pattern: RegExp) {
  const cleaned = value.replace(/[\u0000-\u001f]/g, "").slice(0, 80);
  return pattern.test(cleaned) ? cleaned : fallback;
}

export function diagnosticReport(): DiagnosticReport {
  let connection: DiagnosticConnection;
  try {
    connection = connectionFromConfig(readConfig());
  } catch (error) {
    connection = connectionFromEnv(sanitizeDiagnosticError(error));
  }
  const vercelEnv = envValue("VERCEL_ENV");
  const environment =
    vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development"
      ? vercelEnv
      : envValue("VERCEL")
        ? "vercel"
        : "local";
  return {
    environment: environmentChecks(),
    connection,
    runtime: {
      node: process.version,
      environment,
      commit: bounded(envValue("VERCEL_GIT_COMMIT_SHA").slice(0, 12), "not set", /^[0-9a-f]{7,12}$/i),
      ref: bounded(envValue("VERCEL_GIT_COMMIT_REF"), "not set", /^[A-Za-z0-9._/-]{1,80}$/),
      region: bounded(envValue("VERCEL_REGION"), "not set", /^[a-z0-9-]{1,32}$/i),
      version: packageInfo.version,
    },
  };
}

function driverCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Za-z0-9_]{2,40}$/.test(code) ? code : "";
}

export function sanitizeDiagnosticError(error: unknown) {
  const code = driverCode(error);
  let text = error instanceof Error ? error.message : "";
  text = text.replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s@/]*:[^\s@/]*@[^\s]+/g, "[redacted-url]");
  text = text.replace(
    /([?&#](?:password|pwd|pass|token|secret|user|username)=)[^&\s]+/gi,
    "$1[redacted]",
  );
  text = text.replace(
    /((?:password|pwd|pass|token|secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi,
    "$1[redacted]",
  );
  const secrets = secretEnv
    .map((name) => envValue(name))
    .filter((value) => value.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) text = text.split(secret).join("[redacted]");
  const host = envValue("DB_HOST");
  if (host.length >= 4) text = text.split(host).join("[redacted]");
  const embeddedHost = host.includes("@")
    ? host.slice(host.lastIndexOf("@") + 1).split(/[/:?]/)[0]
    : "";
  if (embeddedHost.length >= 4) text = text.split(embeddedHost).join("[redacted]");
  text = text.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) text = "The database connection failed.";
  if (text.length > 500) text = `${text.slice(0, 500)}…`;
  return code ? `${code}: ${text}` : text;
}

export async function probeDatabase(): Promise<ProbeResult> {
  const started = Date.now();
  let storage: Storage | undefined;
  try {
    const config = readConfig();
    storage = new Storage(config);
    await storage.query("SELECT 1 AS ok");
    return { ok: true, elapsedMs: Date.now() - started };
  } catch (error) {
    console.error("Diagnostics database probe failed", { code: driverCode(error) || "none" });
    return {
      ok: false,
      elapsedMs: Date.now() - started,
      error: sanitizeDiagnosticError(error),
    };
  } finally {
    if (storage) await storage.close().catch(() => undefined);
  }
}
