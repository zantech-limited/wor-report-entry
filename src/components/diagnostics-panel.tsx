"use client";

import { useEffect, useState, type FormEvent } from "react";
import { deskApi } from "@/lib/client-api";
import type { DiagnosticsPayload, EnvStatus } from "@/lib/diagnostics-types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

function statusClass(status: EnvStatus) {
  if (status === "set") return "text-green-700";
  return "text-red-700";
}

export function DiagnosticsPanel() {
  const [token, setToken] = useState("");
  const [report, setReport] = useState<DiagnosticsPayload["report"]>();
  const [probe, setProbe] = useState<DiagnosticsPayload["probe"]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    deskApi<DiagnosticsPayload>("/api/diagnostics")
      .then((data) => {
        if (cancel) return;
        if (data.report) setReport(data.report);
      })
      .catch((reason: unknown) => {
        if (!cancel)
          setError(reason instanceof Error ? reason.message : "Diagnostics could not be loaded.");
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await deskApi<DiagnosticsPayload>("/api/diagnostics", {
        action: "unlock",
        token,
      });
      setToken("");
      setReport(data.report);
      setProbe(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The token could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setError("");
    try {
      const data = await deskApi<DiagnosticsPayload>("/api/diagnostics", { action: "test" });
      setReport(data.report);
      setProbe(data.probe);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The connection test failed.");
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    setBusy(true);
    setError("");
    try {
      await deskApi("/api/diagnostics", { action: "lock" });
      setReport(undefined);
      setProbe(undefined);
      setToken("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The diagnostics session could not be locked.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Admin connection diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          This page does not use the shared database to sign you in. It lists setting
          names, a redacted connection summary, and the result of a connection test.
          Secret values are never shown.
        </p>
      </div>
      {!ready ? (
        <p role="status">Checking the diagnostics session…</p>
      ) : !report ? (
        <form className="grid max-w-lg gap-3" onSubmit={unlock}>
          <label className="grid gap-1 text-sm font-medium" htmlFor="admin-token">
            Administrator token
            <Input
              id="admin-token"
              className="h-11"
              type="password"
              autoComplete="current-password"
              autoCapitalize="off"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <Button type="submit" className="w-fit" disabled={busy || token.length === 0}>
            {busy ? "Checking token…" : "Unlock diagnostics"}
          </Button>
        </form>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={testConnection} disabled={busy}>
              {busy ? "Testing connection…" : "Test connection"}
            </Button>
            <Button type="button" variant="outline" onClick={lock} disabled={busy}>
              Lock diagnostics
            </Button>
          </div>
          <div role="status" aria-live="polite" className="rounded-lg border p-4">
            <h2 className="font-semibold">Connection test</h2>
            {probe ? (
              probe.ok ? (
                <p className="mt-2 text-sm">
                  Connected. SELECT 1 succeeded in {probe.elapsedMs} ms. No schema changes
                  were made.
                </p>
              ) : (
                <p className="mt-2 text-sm text-red-700">{probe.error}</p>
              )
            ) : report.connection.configError ? (
              <p className="mt-2 text-sm">
                Settings could not be resolved. The message below is from configuration,
                not from an open database session. Use Test connection to confirm it.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No connection has been opened in this session.
              </p>
            )}
          </div>
          {report.connection.configError && probe?.error !== report.connection.configError ? (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
              {report.connection.configError}
            </p>
          ) : null}
          <div className="grid gap-2">
            <h2 className="font-semibold">Database settings</h2>
            <dl className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Engine</dt>
                <dd>{report.connection.engine}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Host</dt>
                <dd>{report.connection.host}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Port</dt>
                <dd>{report.connection.port}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">TLS</dt>
                <dd>{report.connection.tls}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Username</dt>
                <dd>{report.connection.username}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Database name</dt>
                <dd>{report.connection.database}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Password</dt>
                <dd>{report.connection.password}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">DB_CODE</dt>
                <dd>{report.connection.databaseCode}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">TLS certificate</dt>
                <dd>{report.connection.certificate}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Settings source</dt>
                <dd>{report.connection.source}</dd>
              </div>
            </dl>
          </div>
          <div className="grid gap-2">
            <h2 className="font-semibold">Environment variables</h2>
            <ul className="grid gap-2">
              {report.environment.map((item) => (
                <li
                  key={item.name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-mono">{item.name}</span>
                  <span>
                    {item.required ? "required" : "optional"} ·{" "}
                    <span className={statusClass(item.status)}>{item.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-2">
            <h2 className="font-semibold">Runtime</h2>
            <dl className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Node</dt>
                <dd>{report.runtime.node}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Deployment</dt>
                <dd>{report.runtime.environment}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Commit</dt>
                <dd>{report.runtime.commit}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Git ref</dt>
                <dd>{report.runtime.ref}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Region</dt>
                <dd>{report.runtime.region}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">App version</dt>
                <dd>{report.runtime.version}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <a className="w-fit underline" href="/login">
        Back to sign in
      </a>
    </section>
  );
}
