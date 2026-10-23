"use client";
import { useEffect, useRef, useState } from "react";
import { deskApi, todayLocal } from "@/lib/client-api";
import {
  emptyJob,
  type FieldJob,
  type Schedule,
  type Alert,
} from "@/lib/field-model";
import type { Actor } from "@/lib/accounts";
import type { DeskRecord } from "@/lib/records";
import {
  unlockVault,
  vaultPut,
  vaultGet,
  vaultDrafts,
  acknowledgeDraft,
  downloadRecovery,
  importRecovery,
  type LocalDraft,
} from "@/lib/offline-vault";
import { FieldJobEditor, type TechnicianOption } from "./field-job-editor";
import { CustomerFormPreview } from "./customer-form-preview";
import { DraftConflict } from "./draft-conflict";
import { FieldTeam } from "./field-team";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
type Identity = { actor: Actor; database: string };
const control = "min-h-11 rounded-lg border bg-background px-3 py-2 text-base";
export function FieldWorkspace() {
  const [identity, setIdentity] = useState<Identity>(),
    [key, setKey] = useState<CryptoKey>(),
    [pin, setPin] = useState(""),
    [month, setMonth] = useState(todayLocal().slice(0, 7)),
    [online, setOnline] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("jobs"),
    [jobs, setJobs] = useState<DeskRecord<FieldJob>[]>([]),
    [drafts, setDrafts] = useState<LocalDraft[]>([]),
    [users, setUsers] = useState<TechnicianOption[]>([]),
    [schedules, setSchedules] = useState<DeskRecord<Schedule>[]>([]),
    [alerts, setAlerts] = useState<DeskRecord<Alert>[]>([]),
    [selected, setSelected] = useState<LocalDraft>(),
    [preview, setPreview] = useState<DeskRecord<FieldJob>>(),
    [localSaved, setLocalSaved] = useState(""),
    [uploadBusy, setUploadBusy] = useState(false);
  const unsaved = useRef(false);
  const uploading = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const current = useRef<LocalDraft | undefined>(undefined),
    lastActivity = useRef(Date.now()),
    context = identity ? `${identity.database}:${identity.actor.id}` : "";
  useEffect(() => {
    function connection() {
      setOnline(navigator.onLine);
    }
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    const saved = localStorage.getItem("zantech-device-identity");
    if (saved) {
      try {
        setIdentity(JSON.parse(saved));
      } catch {}
    }
    void deskApi<Identity>("/api/identity")
      .then((value) => {
        setIdentity(value);
        localStorage.setItem("zantech-device-identity", JSON.stringify(value));
      })
      .catch((error) => {
        if (navigator.onLine) setMessage(error.message);
      });
    return () => {
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  useEffect(() => {
    const activity = () => {
      lastActivity.current = Date.now();
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (unsaved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > 15 * 60 * 1000) {
        if (unsaved.current) {
          setMessage(
            "Device save is incomplete. Download recovery before locking this screen.",
          );
          return;
        }
        setKey(undefined);
        setSelected(undefined);
        current.current = undefined;
        setJobs([]);
        setDrafts([]);
        setPin("");
      }
    }, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, []);
  async function refresh(vaultKey = key) {
    if (!identity || !vaultKey) return;
    setBusy(true);
    try {
      const pending = await vaultDrafts(context, vaultKey);
      setDrafts(pending);
      const cached = await vaultGet<{
        jobs: DeskRecord<FieldJob>[];
        users: TechnicianOption[];
        schedules: DeskRecord<Schedule>[];
      }>(context, vaultKey, "cache:" + month);
      if (cached) {
        setJobs(cached.jobs);
        setUsers(cached.users);
        setSchedules(cached.schedules);
      } else {
        setJobs([]);
        setSchedules([]);
      }
      if (navigator.onLine) {
        const [jobData, directory, scheduleData, alertData] = await Promise.all(
          [
            deskApi<{ jobs: DeskRecord<FieldJob>[] }>(
              `/api/field/jobs?month=${month}`,
            ),
            deskApi<{ users: TechnicianOption[] }>("/api/field/directory"),
            deskApi<{ schedules: DeskRecord<Schedule>[] }>(
              "/api/field/schedules",
            ),
            deskApi<{ alerts: DeskRecord<Alert>[] }>("/api/field/alerts"),
          ],
        );
        setJobs(jobData.jobs);
        setUsers(directory.users);
        setSchedules(scheduleData.schedules);
        setAlerts(alertData.alerts);
        await vaultPut(context, vaultKey, "cache:" + month, {
          jobs: jobData.jobs,
          users: directory.users,
          schedules: scheduleData.schedules,
        });
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not refresh. Your device drafts remain available.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (key && identity)
      void refresh(); /* Month changes load only that month's own jobs. */
  }, [month, key, identity, online]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!key || !online) return;
    const timer = setInterval(() => {
      void deskApi<{ alerts: DeskRecord<Alert>[] }>("/api/field/alerts")
        .then((value) => setAlerts(value.alerts))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [key, online]);
  async function unlock() {
    try {
      if (!identity)
        throw new Error("Sign in online before setting up this device.");
      setBusy(true);
      const value = await unlockVault(context, pin);
      setPin("");
      setKey(value);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function persist(draft: LocalDraft) {
    unsaved.current = true;
    current.current = draft;
    setSelected(draft);
    setLocalSaved("Saving on this device…");
    try {
      await vaultPut(context, key!, "draft:" + draft.id, draft);
      setDrafts(await vaultDrafts(context, key!));
      if (current.current?.operationId === draft.operationId)
        unsaved.current = false;
      setLocalSaved("Saved on this device");
    } catch {
      setLocalSaved("DEVICE SAVE FAILED — keep this screen open");
      setMessage(
        "Device storage could not save your changes. Download recovery before leaving.",
      );
    }
  }
  function edit(job: FieldJob) {
    const previous = current.current;
    if (!previous) return;
    void persist({
      ...previous,
      job,
      operationId: crypto.randomUUID(),
      submit: false,
      updatedAt: new Date().toISOString(),
      conflict: undefined,
    });
  }
  function start(schedule?: DeskRecord<Schedule>) {
    if (!identity) return;
    const id = crypto.randomUUID(),
      job = emptyJob(id);
    job.line.wor = "";
    job.line.date = todayLocal();
    job.assignedIds = schedule
      ? schedule.data.assignedIds
      : [identity.actor.id];
    if (
      schedule &&
      job.assignedIds[0] !== identity.actor.id &&
      identity.actor.role === "tech"
    ) {
      setMessage(
        "The scheduled lead technician creates this shared work order.",
      );
      return;
    }
    const names = job.assignedIds.map(
      (user) => users.find((value) => value.id === user)?.technician || "",
    );
    job.line.technician = names[0] || identity.actor.technicianName;
    job.line.secondaryTech = names[1] || "";
    job.line.additionalTechs = names.slice(2);
    job.fields.completedByName = identity.actor.name;
    job.fields.completedByDesignation = "Technician";
    job.fields.startedDate = job.line.date;
    job.fields.completedDate = job.line.date;
    job.fields.approvedDate = job.line.date;
    if (schedule) {
      job.scheduleId = schedule.id;
      job.line.customer = schedule.data.customer;
      job.line.location = schedule.data.location;
      job.fields.scheduledDate = schedule.data.start.slice(0, 10);
      job.fields.workRequired = schedule.data.workRequired;
    }
    void persist({
      id,
      job,
      revision: 0,
      operationId: crypto.randomUUID(),
      submit: false,
      updatedAt: new Date().toISOString(),
    });
    setTab("entry");
  }
  async function upload(draft: LocalDraft, background = false) {
    if (uploading.current || !key) return;
    uploading.current = true;
    if (!navigator.onLine) {
      uploading.current = false;
      setMessage("Offline — your draft will sync when connected.");
      return;
    }
    setUploadBusy(true);
    setMessage("");
    try {
      await deskApi("/api/identity");
      const response = await deskApi<{
        revision: number;
        requestNumber?: string;
      }>("/api/field/jobs", {
        id: draft.id,
        job: draft.job,
        revision: draft.revision,
        operationId: draft.operationId,
        submit: draft.submit,
      });
      // Advance the live editor before any asynchronous vault writes. An edit
      // made during acknowledgement must use the newly committed revision.
      if (current.current?.id === draft.id) {
        current.current = {
          ...current.current,
          revision: response.revision,
          job: {
            ...current.current.job,
            line: {
              ...current.current.job.line,
              wor: current.current.job.line.wor || response.requestNumber || "",
            },
          },
        };
        setSelected(current.current);
      }
      const savedJob: DeskRecord<FieldJob> = {
        id: draft.id,
        kind: "job",
        ownerId: identity!.actor.id,
        revision: response.revision,
        updatedAt: new Date().toISOString(),
        data: {
          ...draft.job,
          state: draft.submit ? "submitted" : draft.job.state,
          line: {
            ...draft.job.line,
            wor: response.requestNumber || draft.job.line.wor,
          },
        },
      };
      const cacheId = "cache:" + draft.job.line.date.slice(0, 7);
      const cache = await vaultGet<{
        jobs: DeskRecord<FieldJob>[];
        users: TechnicianOption[];
        schedules: DeskRecord<Schedule>[];
      }>(context, key!, cacheId);
      // Retain a durable offline copy before removing the acknowledged outbox item.
      await vaultPut(context, key!, cacheId, {
        users: cache?.users || users,
        schedules: cache?.schedules || schedules,
        jobs: [
          savedJob,
          ...(cache?.jobs || []).filter((row) => row.id !== draft.id),
        ],
      });
      const newer = await acknowledgeDraft(
        context,
        key!,
        draft.id,
        draft.operationId,
        response.revision,
        response.requestNumber,
      );
      if (
        current.current?.id === draft.id &&
        current.current.operationId === draft.operationId
      ) {
        if (background) {
          current.current = {
            ...draft,
            revision: response.revision,
            job: {
              ...draft.job,
              line: {
                ...draft.job.line,
                wor: response.requestNumber || draft.job.line.wor,
              },
            },
          };
          setSelected(current.current);
        } else {
          current.current = undefined;
          setSelected(undefined);
        }
      } else if (newer && current.current?.id === draft.id) {
        current.current = {
          ...current.current,
          revision: response.revision,
          job: {
            ...current.current.job,
            line: {
              ...current.current.job.line,
              wor: current.current.job.line.wor || response.requestNumber || "",
            },
          },
        };
        setSelected(current.current);
      }
      setLocalSaved(
        newer
          ? "New changes saved on this device — sync pending"
          : "Synced — available on your other devices",
      );
      if (!background)
        setMessage(
          `Uploaded revision ${response.revision}.${draft.submit ? " Customer copy queued; check delivery status below." : ""}`,
        );
      if (background) {
        setDrafts(await vaultDrafts(context, key!));
        if (draft.job.line.date.startsWith(month))
          setJobs((rows) => [
            savedJob,
            ...rows.filter((row) => row.id !== draft.id),
          ]);
      } else await refresh();
    } catch (error) {
      const text = (error as Error).message;
      setMessage(text);
      if ((error as { status?: number }).status === 409) {
        const latest =
          current.current?.id === draft.id ? current.current : draft;
        const conflict = { ...latest, conflict: text };
        if (current.current?.id === draft.id) {
          current.current = conflict;
          setSelected(conflict);
        }
        await vaultPut(context, key!, "draft:" + draft.id, conflict);
        setDrafts(await vaultDrafts(context, key!));
      }
    } finally {
      uploading.current = false;
      setUploadBusy(false);
    }
  }
  useEffect(() => {
    if (!key || !online || uploadBusy || unsaved.current) return;
    const draft = drafts.find(
      (d) =>
        !d.submit &&
        !d.conflict &&
        d.job.line.date &&
        d.job.assignedIds.every(Boolean),
    );
    if (!draft) return;
    syncTimer.current = setTimeout(() => void upload(draft, true), 2000);
    return () => clearTimeout(syncTimer.current);
  }, [drafts, key, online]); // eslint-disable-line react-hooks/exhaustive-deps
  async function signOut() {
    if (
      drafts.length &&
      !confirm(
        "This device has unsynced drafts. Download an encrypted recovery copy before signing out?",
      )
    )
      return;
    if (drafts.length) await downloadRecovery(context, key, current.current);
    try {
      await deskApi("/api/auth/sign-out", {});
      localStorage.removeItem("zantech-device-identity");
      location.assign("/login");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function resolveConflict(
    draft: LocalDraft,
    server: DeskRecord<FieldJob>,
    useLocal: boolean,
  ) {
    await vaultPut(
      context,
      key!,
      "archive:" + draft.id + ":" + crypto.randomUUID(),
      draft,
    );
    const job = useLocal
      ? {
          ...draft.job,
          assignedIds: server.data.assignedIds,
          reportId: server.data.reportId,
          line: {
            ...draft.job.line,
            technician: server.data.line.technician,
            secondaryTech: server.data.line.secondaryTech,
            additionalTechs: server.data.line.additionalTechs,
          },
          signature: undefined,
          signedHash: undefined,
          signedRevisionId: undefined,
        }
      : server.data;
    await persist({
      id: draft.id,
      job,
      revision: server.revision,
      operationId: crypto.randomUUID(),
      submit: false,
      updatedAt: new Date().toISOString(),
    });
    setTab("entry");
  }
  const unread = alerts.filter((row) => !row.data.acknowledged);
  if (!identity)
    return (
      <section className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Field service</h1>
        <p className="my-4">
          Sign in online once to prepare this device for offline work.
        </p>
        <a className="underline" href="/login">
          Sign in
        </a>
        {message && <p role="status">{message}</p>}
      </section>
    );
  if (!key)
    return (
      <section className="mx-auto my-8 grid max-w-md gap-4 rounded-2xl border bg-card p-6">
        <h1 className="text-2xl font-semibold">Unlock this device’s drafts</h1>
        <p className="text-sm text-muted-foreground">
          {identity.actor.name} · {online ? "Online" : "Offline"}. Set a device
          passphrase the first time; use it again to unlock saved work. Drafts
          are encrypted on this device. Keep the passphrase with your recovery
          copy.
        </p>
        <label className="grid gap-2 text-sm">
          Device passphrase
          <Input
            type="password"
            minLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void unlock();
            }}
            autoComplete="off"
          />
        </label>
        <Button onClick={() => void unlock()} disabled={busy || pin.length < 6}>
          {busy ? "Unlocking…" : "Unlock / prepare device"}
        </Button>
        <a href="/login" className="text-sm underline">
          Sign in with another account
        </a>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </section>
    );
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-2 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {identity.actor.role} workspace
          </p>
          <h1 className="text-2xl font-semibold">
            Hello, {identity.actor.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {online
              ? "Online — drafts upload only after your review"
              : "Offline — work is saved on this device"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void downloadRecovery(context, key, current.current)}
          >
            Download device recovery
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm">
            Import recovery
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  void importRecovery(
                    context,
                    key!,
                    file,
                    prompt(
                      "Enter the device passphrase used when this recovery file was downloaded.",
                    ) || "",
                  )
                    .then((count) => {
                      setMessage(`Recovered ${count} device drafts.`);
                      void refresh();
                    })
                    .catch((error) => setMessage(error.message));
              }}
            />
          </label>
          <Button
            variant="outline"
            onClick={() => {
              if (unsaved.current) {
                setMessage(
                  "Device save is incomplete. Download recovery before locking this screen.",
                );
                return;
              }
              setKey(undefined);
              setPin("");
              setSelected(undefined);
              current.current = undefined;
            }}
          >
            Lock
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      {unread.some((row) => row.data.urgent) && (
        <div
          role="alert"
          className="rounded-xl border border-red-400 bg-red-50 p-4 text-red-900"
        >
          {unread
            .filter((row) => row.data.urgent)
            .map((row) => (
              <p key={row.id}>
                {row.data.sender}: {row.data.text}
              </p>
            ))}
        </div>
      )}
      <details className="rounded-lg border bg-card p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Install on a phone or iPad
        </summary>
        <p className="mt-2 text-muted-foreground">
          On iPhone/iPad, open this HTTPS address in Safari, choose Share, then
          Add to Home Screen. On Android or desktop, choose Install app from the
          browser menu. Sign in online once and unlock device drafts before
          working offline.
        </p>
      </details>
      <nav
        className="sticky top-0 z-30 flex gap-2 overflow-x-auto rounded-xl border bg-background/95 p-2 backdrop-blur"
        aria-label="Field workspace"
      >
        {[
          ["jobs", "My work orders"],
          ["entry", "Entry"],
          ["uploads", `Review uploads (${drafts.length})`],
          ["schedules", "Schedule"],
          ["alerts", `Alerts (${unread.length})`],
          ...(identity.actor.role === "admin" ? [["team", "Team & SMTP"]] : []),
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={tab === value ? "default" : "outline"}
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {message && (
        <p role="status" className="rounded-lg border bg-card p-3 text-sm">
          {message}
        </p>
      )}
      {tab === "jobs" && (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid gap-1 text-sm">
              Work month
              <Input
                type="month"
                value={month}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}$/.test(e.target.value))
                    setMonth(e.target.value);
                }}
              />
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Refresh
              </Button>
              {["tech", "admin"].includes(identity.actor.role) && (
                <Button onClick={() => start()}>New work order</Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {jobs.length} work orders in this month. Shared jobs appear for
            every assigned technician.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((row) => (
              <article
                key={row.id}
                className="grid gap-2 rounded-xl border bg-card p-4"
              >
                <p className="text-xs text-muted-foreground">
                  {row.data.line.date} · {row.data.state}
                </p>
                <h2 className="font-semibold">{row.data.line.customer}</h2>
                <p className="text-sm">
                  {row.data.line.location} · {row.data.line.wor}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    row.data.line.technician,
                    row.data.line.secondaryTech,
                    ...(row.data.line.additionalTechs || []),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setPreview(row)}>
                    View form
                  </Button>
                  {(identity.actor.role === "admin" ||
                    (row.kind !== "legacy-job" &&
                      row.data.state === "draft" &&
                      row.data.assignedIds[0] === identity.actor.id)) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const draft = drafts.find(
                          (value) => value.id === row.id,
                        ) || {
                          id: row.id,
                          job: row.data,
                          revision: row.revision,
                          operationId: crypto.randomUUID(),
                          submit: false,
                          updatedAt: new Date().toISOString(),
                        };
                        current.current = draft;
                        setSelected(draft);
                        setTab("entry");
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  {row.kind !== "legacy-job" && (
                    <a
                      className="self-center text-sm underline"
                      href={`/api/field/jobs/${row.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!jobs.length && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No saved work orders for this month.
            </p>
          )}
        </section>
      )}
      {tab === "entry" &&
        (selected ? (
          <>
            <p role="status" className="text-sm">
              {localSaved || "Device draft"} ·{" "}
              {selected.submit
                ? "Signed version ready; review uploads to send"
                : "Draft — syncs automatically when connected"}
            </p>
            <FieldJobEditor
              key={selected.id}
              actor={identity.actor}
              users={users}
              job={selected.job}
              onChange={edit}
              onReady={() => {
                const draft = current.current;
                if (draft)
                  void persist({
                    ...draft,
                    submit: true,
                    operationId: crypto.randomUUID(),
                  });
                setTab("uploads");
              }}
            />
          </>
        ) : (
          <div className="rounded-xl border p-6">
            <p>Choose a job from your history or start a new work order.</p>
            {["tech", "admin"].includes(identity.actor.role) && (
              <Button className="mt-4" onClick={() => start()}>
                New work order
              </Button>
            )}
          </div>
        ))}
      {tab === "uploads" && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold">Review before uploading</h2>
          <p className="text-sm text-muted-foreground">
            Unsigned drafts sync automatically when connected. Review the
            customer recipient before sending a signed copy.
          </p>
          {drafts.map((draft) => (
            <article
              key={draft.id}
              className="grid gap-3 rounded-xl border bg-card p-4"
            >
              <h3 className="font-semibold">
                {draft.job.line.customer || "New work order"} ·{" "}
                {draft.job.line.date}
              </h3>
              <p className="text-sm">
                {draft.submit
                  ? `Signed customer copy to ${draft.job.fields.requesterEmail}`
                  : "Draft only; no customer email"}
              </p>
              {draft.conflict && (
                <p className="text-sm text-destructive">
                  {draft.conflict} Your version remains on this device. Open the
                  latest server job before deciding how to reapply changes.
                </p>
              )}
              {draft.conflict && (
                <DraftConflict
                  draft={draft}
                  onResolve={(server, useLocal) =>
                    void resolveConflict(draft, server, useLocal)
                  }
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    current.current = draft;
                    setSelected(draft);
                    setTab("entry");
                  }}
                >
                  Review / edit
                </Button>
                <Button
                  disabled={!online || uploadBusy || !!draft.conflict}
                  onClick={() => void upload(draft)}
                >
                  {uploadBusy ? "Uploading…" : "Upload this reviewed version"}
                </Button>
              </div>
            </article>
          ))}
          {!drafts.length && <p>No pending device drafts.</p>}
        </section>
      )}
      {tab === "schedules" && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold">Schedule</h2>
          {["admin", "supervisor"].includes(identity.actor.role) && (
            <ScheduleCreator users={users} onSaved={() => void refresh()} />
          )}
          <p className="text-xs text-muted-foreground">
            Times shown in Trinidad and Tobago local time.{" "}
            {online
              ? "Refresh for changes."
              : "Showing the last downloaded schedule."}
          </p>
          {schedules.map((row) => (
            <article key={row.id} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {row.data.start.replace("T", " ")} –{" "}
                {row.data.end.replace("T", " ")} · {row.data.status}
              </p>
              <h3 className="font-semibold">
                {row.data.customer} · {row.data.location}
              </h3>
              <p className="my-2 whitespace-pre-wrap text-sm">
                {row.data.workRequired}
              </p>
              <p className="text-xs">
                {row.data.assignedIds
                  .map(
                    (id) =>
                      users.find((user) => user.id === id)?.technician ||
                      "Assigned technician",
                  )
                  .join(", ")}
              </p>
              {!row.data.jobId &&
                row.data.status === "scheduled" &&
                ["tech", "admin"].includes(identity.actor.role) && (
                  <Button className="mt-3" onClick={() => start(row)}>
                    Record work for this visit
                  </Button>
                )}
              {row.data.jobId && (
                <p className="mt-3 text-sm">Work order linked</p>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === "alerts" && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold">Alerts</h2>
          {["admin", "supervisor"].includes(identity.actor.role) && (
            <AlertCreator users={users} />
          )}
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh alerts
          </Button>
          {alerts.map((row) => (
            <article key={row.id} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {row.data.sender} · {new Date(row.updatedAt).toLocaleString()}
              </p>
              <p className="my-3 whitespace-pre-wrap">{row.data.text}</p>
              {row.data.acknowledged ? (
                <span className="text-xs">Acknowledged</span>
              ) : (
                <Button
                  variant="outline"
                  disabled={!online}
                  onClick={() =>
                    void deskApi("/api/field/alerts", { acknowledge: row.id })
                      .then(() => refresh())
                      .catch((error) => setMessage(error.message))
                  }
                >
                  Acknowledge
                </Button>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === "team" && identity.actor.role === "admin" && <FieldTeam />}
      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Work order preview"
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
        >
          <div className="h-full w-full max-w-3xl overflow-auto bg-background p-4">
            <Button className="mb-4" onClick={() => setPreview(undefined)}>
              Close preview
            </Button>
            <CustomerFormPreview job={preview.data} />
            {preview.kind !== "legacy-job" && (
              <JobRevisionLinks id={preview.id} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function ScheduleCreator({
  users,
  onSaved,
}: {
  users: TechnicianOption[];
  onSaved: () => void;
}) {
  const [data, setData] = useState<Schedule>({
      assignedIds: [],
      customer: "",
      location: "",
      start: "",
      end: "",
      workRequired: "",
      status: "scheduled",
    }),
    [message, setMessage] = useState("");
  return (
    <form
      className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void deskApi<{ overlaps: string[] }>("/api/field/schedules", {
          schedule: data,
        })
          .then((result) => {
            setMessage(
              result.overlaps.length
                ? "Saved. Warning: this visit overlaps another assignment."
                : "Schedule saved.",
            );
            onSaved();
          })
          .catch((error) => setMessage(error.message));
      }}
    >
      <h3 className="font-semibold sm:col-span-2">Assign a visit</h3>
      {(
        [
          ["Customer", "customer"],
          ["Location", "location"],
          ["Start", "start"],
          ["End", "end"],
        ] as const
      ).map(([label, field]) => (
        <label key={field} className="grid gap-1 text-sm">
          {label}
          <Input
            required
            type={
              field === "start" || field === "end" ? "datetime-local" : "text"
            }
            value={data[field]}
            onChange={(e) => setData({ ...data, [field]: e.target.value })}
          />
        </label>
      ))}
      <label className="grid gap-1 text-sm sm:col-span-2">
        Technicians (select up to six)
        <select
          className={control}
          multiple
          value={data.assignedIds}
          onChange={(e) =>
            setData({
              ...data,
              assignedIds: [...e.target.selectedOptions]
                .map((option) => option.value)
                .slice(0, 6),
            })
          }
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.technician}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        Work required
        <textarea
          className={control}
          value={data.workRequired}
          onChange={(e) => setData({ ...data, workRequired: e.target.value })}
        />
      </label>
      <Button type="submit">Save schedule</Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
function AlertCreator({ users }: { users: TechnicianOption[] }) {
  const [text, setText] = useState(""),
    [recipients, setRecipients] = useState<string[]>([]),
    [urgent, setUrgent] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="grid gap-3 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void deskApi("/api/field/alerts", { text, recipients, urgent })
          .then(() => {
            setMessage("Alert sent.");
            setText("");
          })
          .catch((error) => setMessage(error.message));
      }}
    >
      <h3 className="font-semibold">Send an alert</h3>
      <label className="grid gap-1 text-sm">
        Recipients
        <select
          className={control}
          multiple
          value={recipients}
          onChange={(e) =>
            setRecipients(
              [...e.target.selectedOptions].map((option) => option.value),
            )
          }
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.technician}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Message
        <textarea
          required
          maxLength={2000}
          className={control}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
        />
        Urgent: show a banner
      </label>
      <Button type="submit">Send alert</Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}

function JobRevisionLinks({ id }: { id: string }) {
  const [data, setData] = useState<{
    signed: { id: string; signedAt: string }[];
    events: {
      time: string;
      revision: number;
      reason: string;
      action: string;
    }[];
  }>({ signed: [], events: [] });
  useEffect(() => {
    void deskApi<typeof data>(`/api/field/jobs/${id}/history`)
      .then(setData)
      .catch(() => {});
  }, [id]);
  return (
    <section className="my-5 grid gap-3">
      <h3 className="font-semibold">Signed copies and changes</h3>
      {data.signed.map((row) => (
        <a
          key={row.id}
          className="text-sm underline"
          target="_blank"
          rel="noreferrer"
          href={`/api/field/jobs/${id}/pdf?revision=${row.id}`}
        >
          Signed copy · {new Date(row.signedAt).toLocaleString()}
        </a>
      ))}
      {data.events.map((row, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          Revision {row.revision} · {row.time} · {row.reason || row.action}
        </p>
      ))}
    </section>
  );
}
