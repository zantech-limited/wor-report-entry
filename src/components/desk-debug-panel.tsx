"use client";

import { useEffect, useState } from "react";
import { deskApi } from "@/lib/client-api";
import type { DebugDesk, DiagnosticsPayload } from "@/lib/diagnostics-types";
import { Button } from "./ui/button";

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function DebugReportView({ debug }: { debug: DebugDesk }) {
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Recent errors stay in memory on this server instance and clear on restart.
        Passwords, tokens, and mail credentials are not shown.
      </p>
      <div className="grid gap-2">
        <h3 className="font-semibold">App</h3>
        <dl className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <Item label="Version" value={debug.version} />
          <Item label="Commit" value={debug.commit} />
          <Item label="Service worker" value={debug.serviceWorker} />
          <Item label="Workbook template" value={debug.template} />
        </dl>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Signed-in account</h3>
        <dl className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <Item label="Status" value={debug.account.status} />
          {debug.account.name ? <Item label="Name" value={debug.account.name} /> : null}
          {debug.account.role ? <Item label="Role" value={debug.account.role} /> : null}
          {debug.account.approval ? (
            <Item label="Approval" value={debug.account.approval} />
          ) : null}
        </dl>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Database</h3>
        <p className="rounded-lg border p-4 text-sm" role="status">
          {debug.database.ok
            ? `Connected. SELECT 1 succeeded in ${debug.database.elapsedMs} ms.`
            : debug.database.error || "The database connection failed."}
        </p>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Mail</h3>
        <dl className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <Item label="Mode" value={debug.mail.mode} />
          <Item label="Host" value={debug.mail.host} />
          <Item label="Sender" value={debug.mail.from} />
          <Item label="Password" value={debug.mail.password} />
        </dl>
        {debug.mail.recent.length ? (
          <ul className="grid gap-2">
            {debug.mail.recent.map((row, index) => (
              <li key={`${row.at}-${index}`} className="rounded-lg border p-3 text-sm">
                <p>
                  {row.kind} mail · {row.state} · {row.at}
                </p>
                {row.error ? <p className="mt-1 text-red-700">{row.error}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No mail results are recorded.</p>
        )}
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Draft sync by device</h3>
        {debug.devicesNote ? (
          <p className="text-sm text-muted-foreground">{debug.devicesNote}</p>
        ) : null}
        {debug.devices.length ? (
          <ul className="grid gap-2">
            {debug.devices.map((row) => (
              <li key={row.device} className="rounded-lg border p-3 text-sm">
                {row.device} · {row.count} {row.count === 1 ? "draft" : "drafts"} · latest{" "}
                {row.latest}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No synced drafts are recorded.</p>
        )}
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Recent server errors and upload attempts</h3>
        {debug.events.length ? (
          <ul className="grid gap-2">
            {debug.events.map((event) => (
              <li key={event.reference} className="rounded-lg border p-3 text-sm">
                <p>
                  {event.kind} · {event.at}
                </p>
                <p className="mt-1">{event.message}</p>
                <p className="mt-1 font-mono text-xs">Support reference {event.reference}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No recent failures are stored on this instance.</p>
        )}
      </div>
    </div>
  );
}

export function DeskDebugPanel() {
  const [debug, setDebug] = useState<DebugDesk>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const data = await deskApi<DiagnosticsPayload>("/api/diagnostics");
      if (!data.debug) {
        setDebug(undefined);
        setError("Debugging details are available to an admin.");
        return;
      }
      setDebug(data.debug);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Debugging details could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Debugging</h2>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {debug ? <DebugReportView debug={debug} /> : !error ? <p role="status">Loading debugging details…</p> : null}
    </section>
  );
}
