import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "desk-diagnostics-.checks-"));
const previousDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = dataDir;
assert.ok(dataDir.includes(".checks"), "Use an isolated .checks database.");

const adminToken = "diag-admin-token-9f3c1a7e-long-enough";
const dbPassword = "diag-db-password-9f3c1a7e";
const authSecret = "diag-auth-secret-9f3c1a7e-0123456789abcdef";
const shortAuth = "short-auth-9f3c1a7e";
const dbUser = "diag-db-user-9f3c1a7e";
const dbName = "diag-db-name-9f3c1a7e";
const cronSecret = "diag-cron-secret-9f3c1a7e";
const dbCode = "66208";
const certificate = "diag-ca-9f3c1a7e-certificate";
const badEngine = "not-a-real-engine-9f3c";
const httpUrl = "http://preview.example.test";
const filePassword = "file-password-9f3c1a7e";
const fileUser = "file-user-9f3c1a7e";
const oidc = "oidc-canary-9f3c1a7e";
const managed = [
  "ADMIN_TOKEN",
  "AUTH_SECRET",
  "CRON_SECRET",
  "APP_URL",
  "DB_ENGINE",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_TLS",
  "DB_CODE",
  "DB_SSL_CA",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_REGION",
  "VERCEL_OIDC_TOKEN",
  "MYSQL_PASSWORD",
  "POSTGRES_PASSWORD",
];

function clearManaged() {
  for (const name of managed) delete process.env[name];
  process.env.VERCEL_OIDC_TOKEN = oidc;
}

function canaries() {
  return [
    adminToken,
    dbPassword,
    authSecret,
    shortAuth,
    dbUser,
    dbName,
    cronSecret,
    dbCode,
    certificate,
    badEngine,
    httpUrl,
    filePassword,
    fileUser,
    oidc,
    "user:diag-db-password",
  ].filter((value) => value.length >= 4);
}

function assertNoSecrets(text: string) {
  for (const secret of canaries()) {
    assert.equal(text.includes(secret), false, "diagnostics output included a secret value");
  }
}

function walk(value: unknown) {
  if (typeof value === "string") {
    assertNoSecrets(value);
    assert.ok(value.length <= 500, "diagnostics string is unexpectedly long");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }
  if (value && typeof value === "object") Object.values(value).forEach(walk);
}

type RouteModule = typeof import("../src/app/api/diagnostics/route");
type DiagnosticsModule = typeof import("../src/lib/diagnostics");

async function main() {
  clearManaged();
  const route: RouteModule = await import("../src/app/api/diagnostics/route");
  const diagnostics: DiagnosticsModule = await import("../src/lib/diagnostics");
  const origin = "http://127.0.0.1:43123";

  async function call(
    method: "GET" | "POST",
    body?: unknown,
    extra: Record<string, string> = {},
  ) {
    const headers = new Headers({ host: "127.0.0.1:43123", origin, ...extra });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await (method === "GET" ? route.GET : route.POST)(
      new Request(`${origin}/api/diagnostics`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const text = await response.text();
    assertNoSecrets(text);
    const json = text ? JSON.parse(text) : {};
    walk(json);
    return { response, text, json };
  }

  function cookie(response: Response) {
    const lines =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie") || ""];
    const match = lines.join("\n").match(/desk-diagnostics=([^;]+)/);
    return match?.[1] || "";
  }

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.DB_PASSWORD = dbPassword;
  process.env.AUTH_SECRET = authSecret;
  const missingGet = await call("GET");
  assert.equal(missingGet.response.status, 200);
  assert.deepEqual(missingGet.json, { configured: false });
  const missingPost = await call("POST", { action: "unlock", token: "wrong" });
  assert.equal(missingPost.response.status, 503);
  assert.match(missingPost.json.error, /ADMIN_TOKEN/);
  assert.equal(missingPost.json.configured, false);
  assert.equal("report" in missingPost.json, false);
  const pageText = readFileSync("src/app/diagnostics/page.tsx", "utf8");
  assert.match(pageText, /ADMIN_TOKEN is not set/);
  assert.match(pageText, /Production and Preview are separate/);
  assert.equal(pageText.includes(adminToken), false);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.ADMIN_TOKEN = adminToken;
  const shortAttempt = await call("POST", { action: "unlock", token: "x" });
  const longAttempt = await call("POST", { action: "unlock", token: "x".repeat(500) });
  assert.equal(shortAttempt.response.status, 401);
  assert.equal(longAttempt.response.status, 401);
  assert.match(shortAttempt.json.error, /incorrect/);
  assert.equal(shortAttempt.text.includes(adminToken), false);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.ADMIN_TOKEN = adminToken;
  process.env.AUTH_SECRET = authSecret;
  process.env.CRON_SECRET = cronSecret;
  process.env.APP_URL = "https://desk.example.test";
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_GIT_COMMIT_SHA = "54e2a08abcdef1234567890abcdef1234567890";
  process.env.VERCEL_GIT_COMMIT_REF = "main";
  process.env.VERCEL_REGION = "iad1";
  const unlocked = await call("POST", { action: "unlock", token: adminToken });
  assert.equal(unlocked.response.status, 200);
  assert.equal(unlocked.response.headers.get("cache-control"), "private, no-store");
  const session = cookie(unlocked.response);
  assert.ok(session, "missing diagnostics cookie");
  assert.equal(/secure/i.test(unlocked.response.headers.get("set-cookie") || ""), false);
  assert.match(unlocked.response.headers.get("set-cookie") || "", /HttpOnly/i);
  assert.match(unlocked.response.headers.get("set-cookie") || "", /SameSite=strict/i);
  assert.equal(unlocked.json.report.connection.engine, "sqlite");
  assert.equal(unlocked.json.report.connection.host, "local file");
  assert.equal(unlocked.json.report.connection.port, "not used");
  assert.equal(unlocked.json.report.connection.tls, "not used");
  assert.equal(unlocked.json.report.connection.password, "not used");
  assert.notEqual(unlocked.json.report.connection.port, "3306");
  assert.equal(unlocked.json.report.runtime.environment, "preview");
  assert.equal(unlocked.json.report.runtime.commit, "54e2a08abcde");
  assert.equal(unlocked.json.report.runtime.ref, "main");
  assert.equal(unlocked.json.report.runtime.region, "iad1");
  assert.equal(unlocked.json.debug.template, "present");
  assert.match(unlocked.json.debug.serviceWorker, /^zantech-shell-v\d+$/);
  assert.equal(unlocked.json.debug.version, unlocked.json.report.runtime.version);
  assert.ok(["missing", "unavailable", "set"].includes(unlocked.json.debug.mail.password));
  assert.ok(["missing", "unavailable", "set"].includes(unlocked.json.debug.mail.host));
  assert.ok(
    ["ready", "not signed in", "database unavailable"].includes(unlocked.json.debug.account.status),
  );
  const names = unlocked.json.report.environment.map((item: { name: string }) => item.name);
  for (const name of ["APP_URL", "AUTH_SECRET", "ADMIN_TOKEN", "DB_ENGINE", "DB_PASSWORD", "DB_TLS"]) {
    assert.ok(names.includes(name), name);
  }
  const secretStatuses = ["set", "missing", "too short", "not https", "invalid", "not used", "on", "off", "local file", "resolved", "unavailable", "sqlite"];
  assert.ok(secretStatuses.includes(unlocked.json.report.connection.password));
  const withCookie = await call("GET", undefined, { cookie: `desk-diagnostics=${session}` });
  assert.equal(withCookie.response.status, 200);
  assert.ok(withCookie.json.report);
  const withoutCookie = await call("GET");
  assert.deepEqual(withoutCookie.json, { configured: true });
  const probe = await call("POST", { action: "test" }, { cookie: `desk-diagnostics=${session}` });
  assert.equal(probe.response.status, 200);
  assert.equal(probe.json.probe.ok, true);
  assert.equal(typeof probe.json.probe.elapsedMs, "number");
  assert.equal(probe.json.probe.error, undefined);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.VERCEL = "1";
  process.env.ADMIN_TOKEN = adminToken;
  process.env.AUTH_SECRET = shortAuth;
  process.env.APP_URL = httpUrl;
  process.env.DB_PASSWORD = dbPassword;
  process.env.DB_TLS = "yes";
  process.env.DB_PORT = "not-a-port";
  const { rememberDeskEvent } = await import("../src/lib/desk-log");
  rememberDeskEvent("upload", new Error(`Upload failed for password=${dbPassword}`));
  const remote = await call("POST", { action: "unlock", token: adminToken });
  assert.equal(remote.response.status, 200);
  assert.match(remote.response.headers.get("set-cookie") || "", /Secure/i);
  assert.equal(remote.json.report.connection.source, "unavailable");
  assert.match(remote.json.report.connection.configError, /remote database/);
  const appUrl = remote.json.report.environment.find((item: { name: string }) => item.name === "APP_URL");
  const auth = remote.json.report.environment.find((item: { name: string }) => item.name === "AUTH_SECRET");
  const tls = remote.json.report.environment.find((item: { name: string }) => item.name === "DB_TLS");
  const port = remote.json.report.environment.find((item: { name: string }) => item.name === "DB_PORT");
  assert.equal(appUrl.status, "not https");
  assert.equal(auth.status, "too short");
  assert.equal(tls.status, "invalid");
  assert.equal(port.status, "invalid");
  assert.equal(remote.json.report.connection.port, "invalid");
  assert.equal(remote.json.debug.database.ok, false);
  assert.ok(
    ["database unavailable", "not signed in"].includes(remote.json.debug.account.status),
  );
  const debugDesk = await import("../src/lib/debug-desk");
  const databaseDown = await debugDesk.debugDesk(null, "unavailable");
  assert.equal(databaseDown.account.status, "database unavailable");
  assert.equal(databaseDown.template, "present");
  assert.equal(JSON.stringify(databaseDown).includes(dbPassword), false);
  assert.equal(remote.json.debug.template, "present");
  assert.match(remote.json.debug.serviceWorker, /zantech-shell-v/);
  const uploadEvent = remote.json.debug.events.find(
    (item: { kind: string }) => item.kind === "upload",
  );
  assert.ok(uploadEvent);
  assert.match(uploadEvent.message, /\[redacted\]/);
  assert.equal(uploadEvent.reference.length, 8);
  assert.equal(remote.text.includes(dbPassword), false);
  assert.equal(remote.text.includes(dbUser), false);
  const remoteProbe = await call("POST", { action: "test" }, {
    cookie: `desk-diagnostics=${cookie(remote.response)}`,
  });
  assert.equal(remoteProbe.json.probe.ok, false);
  assert.match(remoteProbe.json.probe.error, /remote database/);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.ADMIN_TOKEN = "short-token";
  const shortToken = await call("POST", { action: "unlock", token: "short-token" });
  assert.equal(shortToken.response.status, 200);
  const tokenStatus = shortToken.json.report.environment.find(
    (item: { name: string }) => item.name === "ADMIN_TOKEN",
  );
  assert.equal(tokenStatus.status, "too short");
  assert.equal(shortToken.text.includes("short-token"), false);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.ADMIN_TOKEN = adminToken;
  process.env.DB_ENGINE = "postgres";
  process.env.DB_HOST = `user:${dbPassword}@db.example.test`;
  process.env.DB_PORT = "5432";
  process.env.DB_NAME = dbName;
  process.env.DB_USER = dbUser;
  process.env.DB_PASSWORD = dbPassword;
  process.env.DB_TLS = "true";
  process.env.DB_CODE = dbCode;
  process.env.DB_SSL_CA = certificate;
  const redacted = await call("POST", { action: "unlock", token: adminToken });
  assert.equal(redacted.json.report.connection.host, "[redacted]");
  assert.equal(redacted.json.report.connection.port, "5432");
  assert.equal(redacted.json.report.connection.tls, "on");
  assert.equal(redacted.json.report.connection.password, "set");
  assert.equal(redacted.json.report.connection.username, "set");
  assert.equal(redacted.json.report.connection.database, "set");
  assert.equal(redacted.json.report.connection.databaseCode, "set");
  assert.equal(redacted.json.report.connection.certificate, "set");
  assert.equal(redacted.text.includes("db.example.test"), false);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.VERCEL = "1";
  process.env.ADMIN_TOKEN = adminToken;
  process.env.DB_ENGINE = badEngine;
  const invalidEngine = await call("POST", { action: "unlock", token: adminToken });
  assert.equal(invalidEngine.json.report.connection.engine, "invalid");
  assert.equal(invalidEngine.json.report.environment.find((item: { name: string }) => item.name === "DB_ENGINE").status, "invalid");

  const storageFile = path.join(dataDir, "storage.json");
  writeFileSync(
    storageFile,
    JSON.stringify({
      engine: "mysql",
      host: "db.internal.test",
      port: 3306,
      database: "service_report",
      username: fileUser,
      password: filePassword,
      tls: true,
    }),
  );
  try {
    await diagnostics.resetDiagnosticsAttempts();
    clearManaged();
    process.env.ADMIN_TOKEN = adminToken;
    const fromFile = await call("POST", { action: "unlock", token: adminToken });
    assert.equal(fromFile.json.report.connection.engine, "mysql");
    assert.equal(fromFile.json.report.connection.host, "db.internal.test");
    assert.equal(fromFile.json.report.connection.password, "set");
    assert.equal(fromFile.json.report.connection.username, "set");
    assert.equal(fromFile.text.includes(filePassword), false);
    assert.equal(fromFile.text.includes(fileUser), false);
  } finally {
    unlinkSync(storageFile);
  }

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.ADMIN_TOKEN = adminToken;
  process.env.DB_ENGINE = "postgres";
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_PORT = "1";
  process.env.DB_NAME = dbName;
  process.env.DB_USER = dbUser;
  process.env.DB_PASSWORD = dbPassword;
  process.env.DB_TLS = "false";
  const refused = await diagnostics.probeDatabase();
  assert.equal(refused.ok, false);
  assert.ok(refused.error);
  assertNoSecrets(refused.error);
  assert.match(refused.error, /ECONNREFUSED|connect|timeout|failed/i);

  const crafted = diagnostics.sanitizeDiagnosticError(
    Object.assign(
      new Error(
        `connect failed postgres://app:${dbPassword}@db.example.test:5432/${dbName} password=${dbPassword}\nstack hidden`,
      ),
      { code: "ECONNREFUSED" },
    ),
  );
  assert.match(crafted, /^ECONNREFUSED:/);
  assertNoSecrets(crafted);
  assert.equal(crafted.includes("\n"), false);
  assert.equal(diagnostics.fixedEqual("same-token", "same-token"), true);
  assert.equal(diagnostics.fixedEqual("short", "a-much-longer-token"), false);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.ADMIN_TOKEN = adminToken;
  const cross = await call(
    "POST",
    { action: "unlock", token: adminToken },
    { origin: "https://evil.example" },
  );
  assert.equal(cross.response.status, 403);
  assert.equal("report" in cross.json, false);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.ADMIN_TOKEN = adminToken;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const rejected = await call("POST", { action: "unlock", token: `wrong-${attempt}` });
    assert.equal(rejected.response.status, 401);
  }
  diagnostics.forgetDiagnosticsMemory();
  const limited = await call("POST", { action: "unlock", token: adminToken });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.response.headers.get("retry-after"), "60");
  assert.equal("report" in limited.json, false);

  await diagnostics.resetDiagnosticsAttempts();
  clearManaged();
  process.env.ADMIN_TOKEN = adminToken;
  const allowed = await call("POST", { action: "unlock", token: adminToken });
  const probeCookie = cookie(allowed.response);
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const ok = await call("POST", { action: "test" }, { cookie: `desk-diagnostics=${probeCookie}` });
    assert.equal(ok.response.status, 200);
    assert.equal(ok.json.probe.ok, true);
  }
  const probeLimited = await call(
    "POST",
    { action: "test" },
    { cookie: `desk-diagnostics=${probeCookie}` },
  );
  assert.equal(probeLimited.response.status, 429);

  process.env.ADMIN_TOKEN = "rotated-admin-token-9f3c1a7e-long";
  const stale = await call("GET", undefined, { cookie: `desk-diagnostics=${probeCookie}` });
  assert.deepEqual(stale.json, { configured: true });
  assert.equal(stale.text.includes("rotated-admin-token"), false);

  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const errorPage = readFileSync("src/app/error.tsx", "utf8");
  assert.match(layout, /"\/diagnostics"/);
  assert.match(layout, /href="\/diagnostics"/);
  assert.match(errorPage, /href="\/diagnostics"/);

  console.log("Diagnostics checks passed: missing token, constant-time rejection, redaction, probe, and rate limit.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : "Diagnostics check failed");
    process.exitCode = 1;
  })
  .finally(() => {
    clearManaged();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });
