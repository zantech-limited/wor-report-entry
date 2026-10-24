"use client";
import { useEffect, useRef, useState } from "react";
import { deskApi, todayLocal } from "@/lib/client-api";
import { currentDeskMonth, deskMonthLabel, shiftDeskMonth } from "@/lib/desk-month";
import {
  emptyJob,
  needsAmendmentReason,
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
import { DeskDebugPanel } from "./desk-debug-panel";
import { onDraftFlush } from "@/lib/app-update";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
type Identity = { actor: Actor; database: string };
const control = "min-h-11 rounded-lg border bg-background px-3 py-2 text-base";
const alertMessage =
  /fail|could not|conflict|error|invalid|offline|unavailable|sign in/i;
function WorkMonthNav({
  month,
  onMonth,
  count,
  busy,
  role,
}: {
  month: string;
  onMonth: (month: string) => void;
  count: number;
  busy: boolean;
  role: string;
}) {
  const current = currentDeskMonth();
  const label = deskMonthLabel(month);
  const scope =
    role === "tech"
      ? "You see work orders assigned to you."
      : "You see every technician's work orders.";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Work month">
        <Button type="button" variant="outline" onClick={() => onMonth(shiftDeskMonth(month, -1))}>
          Previous
        </Button>
        <h2 className="min-w-44 text-center text-lg font-semibold">{label}</h2>
        <Button type="button" variant="outline" onClick={() => onMonth(shiftDeskMonth(month, 1))}>
          Next
        </Button>
        <Button
          type="button"
          variant={month === current ? "default" : "outline"}
          aria-pressed={month === current}
          onClick={() => onMonth(current)}
        >
          This month
        </Button>
        <Input
          type="month"
          aria-label="Jump to month"
          value={month}
          onChange={(event) => {
            if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))
              onMonth(event.target.value);
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {busy ? "Loading work orders…" : `${count} work orders in ${label}. ${scope}`}
      </p>
    </div>
  );
}
function deviceLabel() {
  const stored = localStorage.getItem("zantech-device-label");
  if (stored) return stored;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const label = `${mobile ? "phone" : "computer"} ${crypto.randomUUID().slice(0, 4)}`;
  localStorage.setItem("zantech-device-label", label);
  return label;
}
function savedLabel(savedOn?: string, savedAt?: string) {
  const when = savedAt ? new Date(savedAt).toLocaleString() : "";
  if (!savedOn && !when) return "Saved on the server";
  return [savedOn ? `Saved on ${savedOn}` : "Saved", when]
    .filter(Boolean)
    .join(" · ");
}
export function FieldWorkspace() {
  const [identity, setIdentity] = useState<Identity>(),
    [key, setKey] = useState<CryptoKey>(),
    [pin, setPin] = useState(""),
    [month, setMonth] = useState(currentDeskMonth),
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
    [uploadBusy, setUploadBusy] = useState(false),
    [syncTick, setSyncTick] = useState(0);
  const unsaved = useRef(false);
  const uploading = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const current = useRef<LocalDraft | undefined>(undefined),
    lastActivity = useRef(Date.now()),
    context = identity ? `${identity.database}:${identity.actor.id}` : "";
  const persistRef = useRef<(draft: LocalDraft) => Promise<void>>(
    async () => {},
  );
  const uploadRef = useRef<
    (draft: LocalDraft, background?: boolean) => Promise<void>
  >(async () => {});
  const keyRef = useRef(key);
  const contextRef = useRef(context);
  keyRef.current = key;
  contextRef.current = context;
  useEffect(() => {
    return onDraftFlush(async () => {
      const vaultKey = keyRef.current;
      const vaultContext = contextRef.current;
      if (!vaultKey || !vaultContext) return;
      const live = current.current;
      if (live) {
        try {
          await persistRef.current(live);
        } catch {
          /* A failed device save must not skip drafts already stored in the vault. */
        }
      }
      if (!navigator.onLine) return;
      const pending = await vaultDrafts(vaultContext, vaultKey);
      for (const draft of pending) {
        if (
          draft.submit ||
          draft.conflict ||
          !draft.job.line.date ||
          !draft.job.assignedIds.every(Boolean) ||
          (needsAmendmentReason(draft.job) && !draft.job.amendmentReason?.trim())
        )
          continue;
        const started = Date.now();
        while (uploading.current && Date.now() - started < 7000)
          await new Promise((resolve) => setTimeout(resolve, 50));
        if (uploading.current) return;
        await uploadRef.current(draft, true);
      }
    });
  }, []);
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
      clearTimeout(retryTimer.current);
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
    if (!identity || !online || key) return;
    let cancel = false;
    void Promise.all([
      deskApi<{ jobs: DeskRecord<FieldJob>[] }>(`/api/field/jobs?month=${month}`),
      deskApi<{ users: TechnicianOption[] }>("/api/field/directory"),
    ])
      .then(([jobData, directory]) => {
        if (cancel) return;
        setJobs(jobData.jobs);
        setUsers(directory.users);
      })
      .catch((error) => {
        if (!cancel)
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load shared drafts.",
          );
      });
    return () => {
      cancel = true;
    };
  }, [identity, online, key, month]);
  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);
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
    const stamped: LocalDraft = {
      ...draft,
      job: {
        ...draft.job,
        savedOn: deviceLabel(),
        savedAt: new Date().toISOString(),
      },
    };
    setLocalSaved("Saving on this device…");
    try {
      await vaultPut(context, key!, "draft:" + stamped.id, stamped);
      if (current.current?.operationId === stamped.operationId) {
        current.current = stamped;
        setSelected(stamped);
      }
      setDrafts(await vaultDrafts(context, key!));
      if (current.current?.operationId === stamped.operationId)
        unsaved.current = false;
      setLocalSaved(`Saved on ${stamped.job.savedOn}`);
    } catch {
      setLocalSaved("DEVICE SAVE FAILED — keep this screen open");
      setMessage(
        "Device storage could not save your changes. Download recovery before leaving.",
      );
    }
  }
  persistRef.current = persist;
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
    job.fields.completedByName = identity.actor.name;
    job.line.technician =
      job.fields.completedByName.trim() ||
      names[0] ||
      identity.actor.technicianName;
    job.line.secondaryTech = names[1] || "";
    job.line.additionalTechs = names.slice(2);
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
    if (
      needsAmendmentReason(draft.job) &&
      !draft.job.amendmentReason?.trim()
    ) {
      if (!background)
        setMessage("Describe the reason for this amendment.");
      return;
    }
    const job = draft.job;
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
        mail?: { state: string; error?: string };
      }>("/api/field/jobs", {
        id: draft.id,
        job,
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
      if (!background) {
        const delivery = response.mail;
        const mailNote = !draft.submit
          ? ""
          : delivery?.state === "sent"
            ? " Customer email sent."
            : delivery?.error
              ? ` Customer email was not sent: ${delivery.error}`
              : " Customer email is queued for the next delivery attempt.";
        setMessage(`Uploaded revision ${response.revision}.${mailNote}`);
      }
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
      const status = (error as { status?: number }).status;
      const reference = (error as { reference?: string }).reference;
      setMessage(
        reference && /^[a-f0-9]{8}$/.test(reference)
          ? `${text} Support reference: ${reference}.`
          : text,
      );
      if (status === 409) {
        const latest =
          current.current?.id === draft.id ? current.current : draft;
        const conflict = { ...latest, conflict: text };
        if (current.current?.id === draft.id) {
          current.current = conflict;
          setSelected(conflict);
        }
        await vaultPut(context, key!, "draft:" + draft.id, conflict);
        setDrafts(await vaultDrafts(context, key!));
      } else if (background && (!status || status >= 500 || status === 429)) {
        setLocalSaved("Not synced — retrying");
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => setSyncTick((n) => n + 1), 8000);
      } else setLocalSaved("Not synced — kept on this device");
    } finally {
      uploading.current = false;
      setUploadBusy(false);
    }
  }
  uploadRef.current = upload;
  useEffect(() => {
    if (!key || !online || uploadBusy || unsaved.current) return;
    const draft = drafts.find(
      (d) =>
        !d.submit &&
        !d.conflict &&
        d.job.line.date &&
        d.job.assignedIds.every(Boolean) &&
        (!needsAmendmentReason(d.job) || !!d.job.amendmentReason?.trim()),
    );
    if (!draft) return;
    syncTimer.current = setTimeout(() => void upload(draft, true), 2000);
    return () => clearTimeout(syncTimer.current);
  }, [drafts, key, online, syncTick]); // eslint-disable-line react-hooks/exhaustive-deps
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
    choice: "local" | "server" | "both",
  ) {
    await vaultPut(
      context,
      key!,
      "archive:" + draft.id + ":" + crypto.randomUUID(),
      draft,
    );
    if (choice === "both") {
      const copyId = crypto.randomUUID();
      await persist({
        id: copyId,
        job: {
          ...draft.job,
          reportId: "",
          signature: undefined,
          signedHash: undefined,
          signedRevisionId: undefined,
          line: { ...draft.job.line, id: copyId, wor: "" },
        },
        revision: 0,
        operationId: crypto.randomUUID(),
        submit: false,
        updatedAt: new Date().toISOString(),
      });
    }
    const job = choice === "local"
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
  if (!key && !online)
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
  if (!key)
    return (
      <section className="mx-auto my-8 grid max-w-3xl gap-4 px-4">
        <div className="grid gap-4 rounded-2xl border bg-card p-6">
          <h1 className="text-2xl font-semibold">Shared drafts</h1>
          <p className="text-sm text-muted-foreground">
            {identity.actor.name} is signed in. Drafts saved from your other
            devices are listed here. Unlock this device to edit them or start
            a new one while offline.
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
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
        </div>
        <WorkMonthNav
          month={month}
          onMonth={setMonth}
          count={jobs.length}
          busy={false}
          role={identity.actor.role}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {jobs.map((row) => (
            <article key={row.id} className="grid gap-2 rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {row.data.line.date} · {row.data.state} ·{" "}
                {savedLabel(row.data.savedOn, row.data.savedAt)}
              </p>
              <h2 className="font-semibold">
                {row.data.line.customer || "Work order"}
              </h2>
              <p className="text-sm">
                {row.data.line.location} · {row.data.line.wor || "Draft"}
              </p>
            </article>
          ))}
        </div>
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
              ? "Online — unsigned drafts sync after a short pause. Signed copies wait for your review."
              : "Offline — work stays on this device until you reconnect."}
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
          ["jobs", identity.actor.role === "tech" ? "My work orders" : "Work orders"],
          ["entry", "Entry"],
          ["uploads", `Review uploads (${drafts.length})`],
          ["schedules", "Schedule"],
          ["alerts", `Alerts (${unread.length})`],
          ...(identity.actor.role === "admin"
            ? [
                ["team", "Team & SMTP"],
                ["debugging", "Debugging"],
              ]
            : []),
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
        <p
          role={alertMessage.test(message) ? "alert" : "status"}
          className="rounded-lg border bg-card p-3 text-sm"
        >
          {message}
        </p>
      )}
      {tab === "jobs" && (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <WorkMonthNav
              month={month}
              onMonth={setMonth}
              count={
                jobs.length +
                drafts.filter(
                  (draft) =>
                    draft.job.line.date.startsWith(month) &&
                    !jobs.some((row) => row.id === draft.id),
                ).length
              }
              busy={busy}
              role={identity.actor.role}
            />
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drafts
              .filter(
                (draft) =>
                  draft.job.line.date.startsWith(month) &&
                  !jobs.some((row) => row.id === draft.id),
              )
              .map((draft) => (
                <article
                  key={draft.id}
                  className="grid gap-2 rounded-xl border border-dashed bg-card p-4"
                >
                  <p className="text-xs text-muted-foreground">
                    {draft.job.line.date} · On this device
                    {draft.conflict ? " · Needs review" : " · Not synced yet"}
                  </p>
                  <h2 className="font-semibold">
                    {draft.job.line.customer || "New work order"}
                  </h2>
                  <p className="text-sm">
                    {draft.job.line.location} ·{" "}
                    {draft.job.line.wor || "Number assigned on sync"}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      current.current = draft;
                      setSelected(draft);
                      setTab("entry");
                    }}
                  >
                    Continue
                  </Button>
                </article>
              ))}
            {jobs.map((row) => (
              <article
                key={row.id}
                className="grid gap-2 rounded-xl border bg-card p-4"
              >
                <p className="text-xs text-muted-foreground">
                  {row.data.line.date} · {row.data.state} ·{" "}
                  {savedLabel(row.data.savedOn, row.data.savedAt)}
                </p>
                <h2 className="font-semibold">{row.data.line.customer}</h2>
                <p className="text-sm">
                  {row.data.line.location} · {row.data.line.wor}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    row.data.line.technician || row.data.fields.completedByName,
                    row.data.line.secondaryTech,
                    ...(row.data.line.additionalTechs || []),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {identity.actor.role === "admin" &&
                  row.data.amendmentReason && (
                    <p className="text-xs">
                      Amendment: {row.data.amendmentReason}
                      {row.data.amendedBy ? ` · ${row.data.amendedBy}` : ""}
                      {row.data.amendedAt
                        ? ` · ${new Date(row.data.amendedAt).toLocaleString()}`
                        : ""}
                    </p>
                  )}
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
          {!busy &&
            !jobs.length &&
            !drafts.some(
              (draft) =>
                draft.job.line.date.startsWith(month) &&
                !jobs.some((row) => row.id === draft.id),
            ) && (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No saved work orders for this month. Start one to record a
                visit.
              </p>
            )}
        </section>
      )}
      {tab === "entry" &&
        (selected ? (
          <>
            <p role="status" aria-live="polite" className="text-sm">
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
                  onResolve={(server, choice) =>
                    void resolveConflict(draft, server, choice)
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
          {!drafts.length && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No pending device drafts. Unsigned work syncs on its own once you
              pause and this device is online.
            </p>
          )}
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
          {!schedules.length && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {online
                ? "No visits are scheduled."
                : "No schedule was saved on this device yet. Connect once to download it."}
            </p>
          )}
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
          {!alerts.length && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {online
                ? "No alerts."
                : "Alerts appear after this device connects."}
            </p>
          )}
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
      {tab === "debugging" && identity.actor.role === "admin" && <DeskDebugPanel />}
      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Work order preview"
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setPreview(undefined)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPreview(undefined);
          }}
        >
          <div
            className="h-full w-full max-w-3xl overflow-auto bg-background p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              className="mb-4"
              autoFocus
              onClick={() => setPreview(undefined)}
            >
              Close preview
            </Button>
            <CustomerFormPreview job={preview.data} />
            {preview.kind !== "legacy-job" && (
              <JobRevisionLinks
                id={preview.id}
                showAmendments={identity.actor.role === "admin"}
              />
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
      <fieldset className="grid gap-1 sm:col-span-2">
        <legend className="text-sm font-medium">Technicians, up to six</legend>
        {!users.length && (
          <p className="text-sm text-muted-foreground">
            No approved technicians are available yet.
          </p>
        )}
        {users.map((user) => {
          const checked = data.assignedIds.includes(user.id);
          return (
            <label
              key={user.id}
              className="flex min-h-11 items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                className="size-5"
                checked={checked}
                disabled={!checked && data.assignedIds.length >= 6}
                onChange={(event) =>
                  setData({
                    ...data,
                    assignedIds: event.target.checked
                      ? [...data.assignedIds, user.id]
                      : data.assignedIds.filter((id) => id !== user.id),
                  })
                }
              />
              {user.technician}
            </label>
          );
        })}
      </fieldset>
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
      <fieldset className="grid gap-1">
        <legend className="text-sm font-medium">Recipients</legend>
        {!users.length && (
          <p className="text-sm text-muted-foreground">
            No approved technicians are available yet.
          </p>
        )}
        {users.map((user) => (
          <label
            key={user.id}
            className="flex min-h-11 items-center gap-3 text-sm"
          >
            <input
              type="checkbox"
              className="size-5"
              checked={recipients.includes(user.id)}
              onChange={(event) =>
                setRecipients(
                  event.target.checked
                    ? [...recipients, user.id]
                    : recipients.filter((id) => id !== user.id),
                )
              }
            />
            {user.technician}
          </label>
        ))}
      </fieldset>
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

function JobRevisionLinks({
  id,
  showAmendments,
}: {
  id: string;
  showAmendments: boolean;
}) {
  const [data, setData] = useState<{
    signed: { id: string; signedAt: string }[];
    amendments?: {
      time: string;
      revision: number;
      reason: string;
      actorName: string;
    }[];
    events: {
      time: string;
      revision: number;
      reason: string;
      action: string;
      actorName?: string;
    }[];
  }>({ signed: [], events: [] });
  useEffect(() => {
    void deskApi<typeof data>(`/api/field/jobs/${id}/history`)
      .then(setData)
      .catch(() => {});
  }, [id]);
  const amendments =
    data.amendments?.length
      ? data.amendments
      : data.events
          .filter((row) => row.reason)
          .map((row) => ({
            time: row.time,
            revision: row.revision,
            reason: row.reason,
            actorName: row.actorName || "",
          }));
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
      {showAmendments &&
        amendments.map((row, i) => (
          <p key={i} className="text-sm">
            Revision {row.revision} · {row.actorName || "Team member"} ·{" "}
            {new Date(row.time).toLocaleString()} · {row.reason}
          </p>
        ))}
      {showAmendments && !amendments.length && (
        <p className="text-xs text-muted-foreground">No amendments yet.</p>
      )}
    </section>
  );
}
