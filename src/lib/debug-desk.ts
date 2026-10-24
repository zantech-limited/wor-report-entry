import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import packageInfo from "../../package.json";
import type { Actor } from "./accounts";
import { recentDeskEvents } from "./desk-log";
import {
  diagnosticReport,
  diagnosticsSessionValid,
  probeDatabase,
  sanitizeDiagnosticError,
} from "./diagnostics";
import type { DebugAccount, DebugDesk, DebugDevice, DebugMailResult } from "./diagnostics-types";
import type { FieldJob } from "./field-model";

const unavailableMail = {
  mode: "unavailable",
  host: "unavailable",
  from: "unavailable",
  password: "unavailable",
  recent: [] as DebugMailResult[],
};

function presence(value: string) {
  return value ? "set" : "missing";
}

function clean(value: string, max: number) {
  return value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function deviceLabel(value: string | undefined) {
  const text = clean(value || "", 80).replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[redacted]",
  );
  return text || "unlabeled device";
}

function stamp(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}T[0-9:.Z+-]{0,24}$/.test(value) ? value : "unknown";
}

function serviceWorkerCache() {
  try {
    const source = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
    return source.match(/zantech-shell-v\d+/)?.[0] || "unavailable";
  } catch {
    return "unavailable";
  }
}

function templateState(): "present" | "missing" {
  return existsSync(path.join(process.cwd(), "templates", "monthly-service-report.xlsm"))
    ? "present"
    : "missing";
}

function accountOf(actor: Actor | null, state: "ready" | "unavailable" | "anonymous"): DebugAccount {
  if (state === "unavailable") return { status: "database unavailable" };
  if (!actor) return { status: "not signed in" };
  return {
    status: "ready",
    name: clean(actor.name, 120) || "unnamed",
    role: actor.role,
    approval: clean(actor.status, 40) || "unknown",
  };
}

async function mailHealth(): Promise<DebugDesk["mail"]> {
  try {
    const { smtpSettings } = await import("./smtp");
    const { records } = await import("./records");
    const settings = await smtpSettings();
    const rows = [
      ...(await records<{
        state?: string;
        lastError?: string;
        sentAt?: string;
      }>("customer-mail")),
      ...(await records<{
        state?: string;
        lastError?: string;
        sentAt?: string;
      }>("account-mail")),
    ]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8);
    const recent: DebugMailResult[] = rows.map((row) => {
      const error = row.data.lastError
        ? clean(sanitizeDiagnosticError(new Error(row.data.lastError)), 300)
        : "";
      return {
        kind: row.kind === "account-mail" ? "account" : "customer",
        state: clean(String(row.data.state || "unknown"), 40) || "unknown",
        at: stamp(row.data.sentAt || row.updatedAt),
        ...(error ? { error } : {}),
      };
    });
    const mode =
      settings.mode === "disabled" || settings.mode === "test" || settings.mode === "smtp"
        ? settings.mode
        : "unavailable";
    return {
      mode,
      host: presence(settings.host),
      from: presence(settings.from),
      password: presence(settings.password),
      recent,
    };
  } catch {
    return { ...unavailableMail };
  }
}

async function draftDevices(): Promise<{ devices: DebugDevice[]; note?: string }> {
  try {
    const { records } = await import("./records");
    const jobs = await records<FieldJob>("job");
    const grouped = new Map<string, { count: number; latest: string }>();
    for (const row of jobs) {
      const device = deviceLabel(row.data.savedOn);
      const when = stamp(row.data.savedAt || row.updatedAt);
      const current = grouped.get(device) || { count: 0, latest: "unknown" };
      current.count += 1;
      if (when !== "unknown" && (current.latest === "unknown" || when > current.latest))
        current.latest = when;
      grouped.set(device, current);
    }
    return {
      devices: [...grouped.entries()]
        .sort((a, b) => b[1].latest.localeCompare(a[1].latest))
        .slice(0, 20)
        .map(([device, value]) => ({ device, count: value.count, latest: value.latest })),
    };
  } catch {
    return { devices: [], note: "database unavailable" };
  }
}

export async function debugAccess(request: Request) {
  const token = diagnosticsSessionValid(request.headers.get("cookie"));
  let actor: Actor | null = null;
  let accountState: "ready" | "unavailable" | "anonymous" = "anonymous";
  try {
    const { currentActor } = await import("./accounts");
    actor = await currentActor(request.headers);
    accountState = actor ? "ready" : "anonymous";
  } catch {
    actor = null;
    accountState = "unavailable";
  }
  return {
    allowed: token || actor?.role === "admin",
    actor,
    accountState,
  };
}

export async function debugDesk(
  actor: Actor | null,
  accountState: "ready" | "unavailable" | "anonymous",
): Promise<DebugDesk> {
  const runtime = diagnosticReport().runtime;
  const [probed, mail, drafts] = await Promise.all([
    probeDatabase().catch((error: unknown) => ({
      ok: false,
      elapsedMs: 0,
      error: sanitizeDiagnosticError(error),
    })),
    mailHealth(),
    draftDevices(),
  ]);
  const database = probed.error
    ? { ...probed, error: probed.error.slice(0, 500) }
    : probed;
  return {
    version: packageInfo.version,
    commit: runtime.commit,
    serviceWorker: serviceWorkerCache(),
    template: templateState(),
    database,
    mail,
    devices: drafts.devices,
    ...(drafts.note ? { devicesNote: drafts.note } : {}),
    account: accountOf(actor, accountState),
    events: recentDeskEvents(),
  };
}
