"use client";
import { useEffect, useRef, useState } from "react";
import {
  Database,
  Download,
  KeyRound,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Part } from "@/lib/parts-model";

type Config = {
  engine: "sqlite" | "mysql" | "postgres";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  tls: boolean;
  hasPassword?: boolean;
};
type Event = { time: string; level: string; action: string; message: string };
type Overview = {
  config: Config;
  activeEngine: string;
  writesPaused: boolean;
  events: Event[];
  reportCount: number;
  environmentConfigured: boolean;
};
const initialConfig: Config = {
  engine: "sqlite",
  host: "localhost",
  port: 3306,
  database: "service_report",
  username: "",
  password: "",
  tls: false,
};
const emptyPart: Part = {
  partNo: "",
  description: "",
  defaultQty: "1",
  active: true,
};
const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base";

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "The operation could not be completed.");
  return body;
}
export function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [parts, setParts] = useState<Part[]>([]);
  const [part, setPart] = useState(emptyPart);
  const [partSearch, setPartSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [confirmMigration, setConfirmMigration] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);
  async function load() {
    const [next, catalog] = await Promise.all([
      request("/api/admin"),
      request("/api/admin/parts"),
    ]);
    setOverview(next);
    setConfig(next.config);
    setParts(catalog.parts);
    setConfirmMigration(false);
  }
  useEffect(() => {
    void (async () => {
      try {
        const session = await request("/api/admin/session");
        setAuthenticated(session.authenticated);
        if (session.authenticated) await load();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not load Admin.",
        );
      } finally {
        setChecking(false);
      }
    })();
  }, []);
  async function act(name: string, work: () => Promise<void>) {
    setPending(name);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operation failed.");
    } finally {
      setPending("");
    }
  }
  function updateConfig(patch: Partial<Config>) {
    setConfig((current) => ({ ...current, ...patch }));
    setConfirmMigration(false);
  }
  async function storage(action: "test" | "migrate") {
    const body = await request("/api/admin/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        config,
        keepPassword: !config.password && !!config.hasPassword,
      }),
    });
    setMessage(body.message);
    if (action === "migrate") await load();
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Parts, backups, storage, and recent activity for this service desk.
          </p>
        </div>
        {authenticated && (
          <Button
            variant="outline"
            disabled={!!pending}
            onClick={() =>
              void act("logout", async () => {
                await request("/api/admin/session", { method: "DELETE" });
                setAuthenticated(false);
                setOverview(null);
                setParts([]);
                setConfig(initialConfig);
              })
            }
          >
            Lock Admin
          </Button>
        )}
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className={
          message ? "rounded-xl border bg-accent p-4 text-sm" : "sr-only"
        }
      >
        {message}
      </p>
      {checking ? (
        <p className="text-sm text-muted-foreground">
          Checking administrator session…
        </p>
      ) : !authenticated ? (
        <form
          className="grid max-w-lg gap-4 rounded-xl border bg-card p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void act("login", async () => {
              await request("/api/admin/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
              });
              setToken("");
              setAuthenticated(true);
              await load();
            });
          }}
        >
          <KeyRound className="size-6 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Unlock administration</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Use ADMIN_TOKEN from your server configuration. For a local setup,
            your generated token is in data/admin-token.txt. Your session lasts
            eight hours.
          </p>
          <Field
            label="Administrator token"
            id="admin-token"
            type="password"
            value={token}
            onChange={setToken}
          />
          <Button type="submit" disabled={!!pending || !token}>Unlock Admin</Button>
        </form>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Active storage"
              value={
                overview?.activeEngine === "postgres"
                  ? "PostgreSQL"
                  : overview?.activeEngine === "mysql"
                    ? "MySQL"
                    : "SQLite"
              }
            />
            <Metric
              label="Saved months"
              value={String(overview?.reportCount ?? "—")}
            />
            <Metric
              label="Parts in catalog"
              value={String(parts.filter((p) => p.active).length)}
            />
          </div>
          {overview?.writesPaused && (
            <p
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              Migration is prepared. Report and catalog changes are paused.
              Restart the service desk to activate the saved storage settings.
            </p>
          )}
          <section className="grid gap-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
            <div>
              <h2 className="text-lg font-semibold">Parts catalog</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Part numbers fill descriptions and quantities on corresponding
                lines in Entry. Archive a part to hide it from suggestions; past
                work orders keep their values.
              </p>
            </div>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void act("part", async () => {
                  const body = await request("/api/admin/parts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...part, consolidate: !!part.needsConsolidation }),
                  });
                  setParts(body.parts);
                  setPart(emptyPart);
                  setMessage(
                    "Part saved. Reload Entry to use the updated catalog.",
                  );
                });
              }}
            >
              <Field
                label="Part number"
                id="catalog-number"
                value={part.partNo}
                onChange={(value) => setPart({ ...part, partNo: value })}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Description"
                  id="catalog-description"
                  value={part.description}
                  onChange={(value) => setPart({ ...part, description: value })}
                />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={part.active}
                  onChange={(event) =>
                    setPart({ ...part, active: event.target.checked })
                  }
                />
                Available for suggestions
              </label>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPart(emptyPart)}
                >
                  Clear
                </Button>
                <Button type="submit" disabled={!!pending || overview?.writesPaused}>
                  Save part
                </Button>
              </div>
            </form>
            <Field
              label="Find a part"
              id="catalog-search"
              value={partSearch}
              onChange={setPartSearch}
            />
            <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
              {parts
                .filter((p) =>
                  `${p.partNo} ${p.description}`
                    .toLowerCase()
                    .includes(partSearch.toLowerCase()),
                )
                .map((p) => (
                  <li key={p.partNo}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted"
                      onClick={() => setPart(p)}
                    >
                      <span>
                        <span className="font-mono text-sm font-semibold">
                          {p.partNo}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                        {p.description} · Used {p.usageCount ?? 0} {(p.usageCount ?? 0) === 1 ? "time" : "times"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.active
                          ? "Edit"
                          : "Archived · Edit"}
                      </span>
                    </button>
                  </li>
                ))}
              {parts.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">
                  Add the first part above.
                </li>
              )}
            </ul>
          </section>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section className="grid gap-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Database className="size-5" aria-hidden="true" />
                  Storage connection
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  SQLite works locally. MySQL and PostgreSQL need an existing
                  empty database and a user with table creation and read/write
                  permissions.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="storage-engine">Database engine</Label>
                <select
                  id="storage-engine"
                  className={selectClass}
                  value={config.engine}
                  onChange={(event) =>
                    updateConfig({
                      engine: event.target.value as Config["engine"],
                      port: event.target.value === "postgres" ? 5432 : 3306,
                      password: "",
                      hasPassword: false,
                    })
                  }
                >
                  <option value="sqlite">SQLite · local file</option>
                  <option value="mysql">MySQL</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </div>
              {config.engine !== "sqlite" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
                    <Field
                      label="Host"
                      id="storage-host"
                      value={config.host}
                      onChange={(host) => updateConfig({ host })}
                    />
                    <Field
                      label="Port"
                      id="storage-port"
                      type="number"
                      value={String(config.port)}
                      onChange={(port) => updateConfig({ port: Number(port) })}
                    />
                  </div>
                  <Field
                    label="Database name"
                    id="storage-database"
                    value={config.database}
                    onChange={(database) => updateConfig({ database })}
                  />
                  <Field
                    label="Username"
                    id="storage-user"
                    value={config.username}
                    onChange={(username) => updateConfig({ username })}
                  />
                  <Field
                    label={
                      config.hasPassword
                        ? "Password (leave blank to keep saved password)"
                        : "Password"
                    }
                    id="storage-password"
                    type="password"
                    value={config.password}
                    onChange={(password) => updateConfig({ password })}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={config.tls}
                      onChange={(event) =>
                        updateConfig({ tls: event.target.checked })
                      }
                    />
                    Use TLS with certificate verification
                  </label>
                </>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  Reports are stored in the persistent data directory. To return
                  from a remote database, download a backup, restart with
                  DB_ENGINE=sqlite, then restore it.
                </p>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                Saved connection settings stay in the private data directory.
                Use environment variables for deployment secrets. Passwords are
                never shown in logs or returned by this page.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!!pending || overview?.writesPaused}
                  onClick={() => void act("test", () => storage("test"))}
                >
                  Test connection
                </Button>
                {config.engine !== "sqlite" && (
                  <Button
                    disabled={
                      !!pending ||
                      overview?.writesPaused ||
                      overview?.environmentConfigured
                    }
                    onClick={() => setConfirmMigration(true)}
                  >
                    Prepare storage switch
                  </Button>
                )}
              </div>
              {overview?.environmentConfigured && (
                <p className="text-sm text-muted-foreground">
                  Environment variables control storage. Change those on the
                  server after downloading a backup.
                </p>
              )}
              {confirmMigration && (
                <div className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p>
                    Copy all months, imported workbooks, remembered names, and
                    parts into this empty destination. A local backup is saved
                    first. After verification, writes pause until you restart.
                    The source remains intact.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!!pending}
                      onClick={() =>
                        void act("migrate", () => storage("migrate"))
                      }
                    >
                      Copy data and switch on restart
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmMigration(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <section className="grid gap-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                  Backup and restore
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Download a portable JSON backup of all reports, original
                  workbooks, names, and parts. Keep it somewhere safe.
                </p>
              </div>
              <a
                href="/api/admin/backup"
                download
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <Download className="size-4" aria-hidden="true" />
                Download backup
              </a>
              <div className="border-t pt-4">
                <p className="mb-3 text-sm leading-6 text-muted-foreground">
                  Restore adds months as new copies. Existing reports and
                  catalog entries are preserved. Repeated restores create
                  additional copies.
                </p>
                <input
                  ref={restoreRef}
                  type="file"
                  accept=".json,application/json"
                  aria-label="Restore a service desk backup"
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-2"
                  disabled={!!pending || overview?.writesPaused}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void act("restore", async () => {
                      const form = new FormData();
                      form.set("file", file);
                      const body = await request("/api/admin/backup", {
                        method: "POST",
                        body: form,
                      });
                      setMessage(body.message);
                      await load();
                      if (restoreRef.current) restoreRef.current.value = "";
                    });
                  }}
                />
              </div>
            </section>
          </div>
          <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Recent activity</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Latest 200 events. Work-order text and credentials are
                  excluded.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!!pending}
                onClick={() => void act("refresh", load)}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Refresh
              </Button>
            </div>
            <div className="grid max-w-xs gap-1.5">
              <Label htmlFor="event-filter">Show events</Label>
              <select
                id="event-filter"
                className={selectClass}
                value={logFilter}
                onChange={(event) => setLogFilter(event.target.value)}
              >
                <option value="all">All events</option>
                <option value="error">Errors only</option>
                <option value="info">Activity only</option>
              </select>
            </div>
            <ul className="max-h-96 divide-y overflow-y-auto">
              {overview?.events
                .filter((e) => logFilter === "all" || e.level === logFilter)
                .map((e, index) => (
                  <li
                    key={`${e.time}-${index}`}
                    className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"
                  >
                    <time
                      className="text-xs tabular-nums text-muted-foreground"
                      dateTime={e.time}
                    >
                      {new Date(e.time).toLocaleString()}
                    </time>
                    <div>
                      <p
                        className={`text-sm font-medium ${e.level === "error" ? "text-destructive" : ""}`}
                      >
                        {e.level === "error" ? "Error · " : ""}
                        {e.action}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {e.message}
                      </p>
                    </div>
                  </li>
                ))}
              {!overview?.events.length && (
                <li className="py-4 text-sm text-muted-foreground">
                  Activity appears here as you use the desk.
                </li>
              )}
            </ul>
          </section>
        </>
      )}
      {pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Working…
        </p>
      )}
    </div>
  );
}
function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={type === "password" ? "new-password" : "off"}
        className="h-11 text-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
