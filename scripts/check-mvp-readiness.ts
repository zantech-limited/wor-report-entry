import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { equalSecret } from "../src/lib/admin-auth";
import { clientErrorMessage } from "../src/lib/http";
import { flushDeviceDrafts, onDraftFlush } from "../src/lib/app-update";
import { deploymentCheck } from "../src/lib/startup-env";
import { safeMailHeader } from "../src/lib/mail-header";

const keys = [
  "VERCEL",
  "APP_URL",
  "AUTH_SECRET",
  "DB_ENGINE",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_TLS",
  "CRON_SECRET",
  "ADMIN_TOKEN",
] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function restore() {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function fillValid() {
  process.env.VERCEL = "1";
  process.env.APP_URL = "https://wor-report-entry.vercel.app";
  process.env.AUTH_SECRET = "x".repeat(32);
  process.env.DB_ENGINE = "supabase";
  process.env.DB_HOST = "aws-0-example.pooler.supabase.com";
  process.env.DB_PORT = "6543";
  process.env.DB_NAME = "postgres";
  process.env.DB_USER = "postgres.example";
  process.env.DB_PASSWORD = "super-secret-database-password";
  process.env.DB_TLS = "true";
  process.env.CRON_SECRET = "cron-secret-value";
  process.env.ADMIN_TOKEN = "admin-token-value";
}

async function main() {
try {
  delete process.env.VERCEL;
  assert.deepEqual(deploymentCheck(), { blocking: [], warnings: [] });
  fillValid();
  assert.deepEqual(deploymentCheck(), { blocking: [], warnings: [] });
  delete process.env.CRON_SECRET;
  delete process.env.ADMIN_TOKEN;
  delete process.env.APP_URL;
  process.env.DB_TLS = "false";
  const gaps = deploymentCheck();
  assert.deepEqual(gaps.blocking.sort(), ["APP_URL", "DB_TLS"]);
  assert.deepEqual(gaps.warnings.sort(), ["ADMIN_TOKEN", "CRON_SECRET"]);
  const printed = JSON.stringify(gaps);
  assert(!printed.includes("super-secret-database-password"));
  assert(!printed.includes("postgres.example"));
  assert(!printed.includes(process.env.AUTH_SECRET || "missing-secret"));
  assert.equal(equalSecret("same-token", "same-token"), true);
  assert.equal(equalSecret("short", "a-much-longer-token"), false);
  assert.equal(
    clientErrorMessage(
      new Error("Workbook is missing xl/workbook.xml."),
      "Could not import that workbook.",
    ),
    "Could not import that workbook.",
  );
  assert.equal(
    clientErrorMessage(
      new Error("This workbook has no Master sheet."),
      "Could not import that workbook.",
    ),
    "This workbook has no Master sheet.",
  );
  assert.equal(safeMailHeader("WO 1042\r\nBcc: attacker@example.test"), "WO 1042 Bcc: attacker@example.test");
  assert.equal(safeMailHeader("  Zantech\twork order  "), "Zantech work order");
  assert.equal(safeMailHeader(""), "");
  const worker = readFileSync("public/sw.js", "utf8");
  assert.match(worker, /zantech-shell-v065/);
  assert.match(worker, /cacheEach/);
  assert.match(worker, /SKIP_WAITING/);
  const setup = readFileSync("src/components/pwa-setup.tsx", "utf8");
  assert.match(setup, /Update now/);
  assert.match(setup, /BroadcastChannel/);
  assert.match(setup, /controllerchange/);
  assert.match(readFileSync("src/app/api/cron/mail/route.ts", "utf8"), /drainMailQueue/);
  let runs = 0;
  const stop = onDraftFlush(() => {
    runs += 1;
  });
  const stopFailing = onDraftFlush(() => {
    throw new Error("draft flush failed");
  });
  await flushDeviceDrafts();
  assert.equal(runs, 1);
  stop();
  stopFailing();
  await flushDeviceDrafts();
  assert.equal(runs, 1);
  console.log("MVP readiness checks passed.");
} finally {
  restore();
}
}

void main();
