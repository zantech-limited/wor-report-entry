"use client";
import { useEffect, useState } from "react";
import { deskApi } from "@/lib/client-api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  technician: string;
};
type Settings = {
  mode: "disabled" | "test" | "smtp";
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  replyTo: string;
  passwordSet?: boolean;
};
type Delivery = {
  id: string;
  kind: string;
  data: { state: string; to: string; jobId?: string; lastError?: string };
};
const control = "min-h-11 rounded-lg border bg-background px-3 py-2";
export function FieldTeam() {
  const [users, setUsers] = useState<User[]>([]),
    [settings, setSettings] = useState<Settings>({
      mode: "disabled",
      host: "",
      port: 587,
      username: "",
      password: "",
      from: "",
      replyTo: "",
    }),
    [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [message, setMessage] = useState(""),
    [recipient, setRecipient] = useState(""),
    [inviteName, setInviteName] = useState(""),
    [inviteEmail, setInviteEmail] = useState("");
  async function load() {
    try {
      const [accounts, mail] = await Promise.all([
        deskApi<{ users: User[] }>("/api/field/users"),
        deskApi<{
          settings: Omit<Settings, "password">;
          deliveries: Delivery[];
        }>("/api/field/mail"),
      ]);
      setUsers(accounts.users);
      setSettings({ ...mail.settings, password: "" });
      setDeliveries(mail.deliveries);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const update = (index: number, field: keyof User, value: string) =>
    setUsers(
      users.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-xl border bg-card p-4">
        <h2 className="text-xl font-semibold">Technician accounts</h2>
        <p className="text-sm text-muted-foreground">
          Approve registrations and link each person to their existing
          technician name. Archive or remove access without deleting job
          history.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void deskApi("/api/field/users", {
              invite: true,
              name: inviteName,
              email: inviteEmail,
            })
              .then(() => {
                setMessage(
                  "Invitation and password setup emails queued. Approve the account after linking its technician name.",
                );
                void load();
              })
              .catch((error) => setMessage(error.message));
          }}
        >
          <label className="grid gap-1 text-sm">
            Name
            <Input
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Email
            <Input
              required
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </label>
          <Button type="submit">Invite technician</Button>
        </form>
        {users.map((user, index) => (
          <article
            key={user.id}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="break-all text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
            <label className="grid gap-1 text-sm">
              Technician history name
              <Input
                value={user.technician}
                onChange={(e) => update(index, "technician", e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Role
              <select
                className={control}
                value={user.role}
                onChange={(e) => update(index, "role", e.target.value)}
              >
                {["tech", "supervisor", "manager", "admin"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Access
              <select
                className={control}
                value={user.status}
                onChange={(e) => update(index, "status", e.target.value)}
              >
                <option value="pending">Pending approval</option>
                <option value="active">Active</option>
                <option value="archived">Archived / access removed</option>
              </select>
            </label>
            <Button
              variant="outline"
              onClick={() =>
                void deskApi("/api/field/users", user)
                  .then(() => {
                    setMessage(
                      `Updated ${user.name}; previous sessions revoked.`,
                    );
                    void load();
                  })
                  .catch((error) => setMessage(error.message))
              }
            >
              Save account
            </Button>
          </article>
        ))}
      </section>
      <section className="grid gap-4 rounded-xl border bg-card p-4">
        <h2 className="text-xl font-semibold">SMTP email</h2>
        <p className="text-sm text-muted-foreground">
          Passwords are encrypted in the database and never returned. Customer
          emails are queued only after the technician reviews a signed version.
        </p>
        <label className="grid gap-1 text-sm">
          Delivery mode
          <select
            className={control}
            value={settings.mode}
            onChange={(e) =>
              setSettings({
                ...settings,
                mode: e.target.value as Settings["mode"],
              })
            }
          >
            <option value="disabled">Disabled</option>
            <option value="test">Local mail catcher (test only)</option>
            <option value="smtp">SMTP with verified TLS</option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["SMTP host", "host"],
              ["Port", "port"],
              ["Username", "username"],
              ["Sender email", "from"],
              ["Reply-to email", "replyTo"],
            ] as const
          ).map(([label, field]) => (
            <label key={field} className="grid gap-1 text-sm">
              {label}
              <Input
                type={
                  field === "port"
                    ? "number"
                    : field === "from" || field === "replyTo"
                      ? "email"
                      : "text"
                }
                value={settings[field]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    [field]:
                      field === "port"
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            Password{" "}
            {settings.passwordSet
              ? "(leave empty to retain saved password)"
              : ""}
            <Input
              type="password"
              autoComplete="new-password"
              value={settings.password}
              onChange={(e) =>
                setSettings({ ...settings, password: e.target.value })
              }
            />
          </label>
        </div>
        <Button
          onClick={() =>
            void deskApi("/api/field/mail", { settings })
              .then(() => {
                setMessage("SMTP settings saved.");
                void load();
              })
              .catch((error) => setMessage(error.message))
          }
        >
          Save SMTP settings
        </Button>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void deskApi("/api/field/mail", { testRecipient: recipient })
              .then(() => setMessage("Test email accepted by SMTP."))
              .catch((error) => setMessage(error.message));
          }}
        >
          <label className="grid gap-1 text-sm">
            Send a test to
            <Input
              type="email"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline">
            Send test email
          </Button>
        </form>
      </section>
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="text-xl font-semibold">Email delivery queue</h2>
          <Button
            variant="outline"
            onClick={() =>
              void deskApi("/api/field/mail", { process: true })
                .then(() => load())
                .catch((error) => setMessage(error.message))
            }
          >
            Process queued messages
          </Button>
        </div>
        {deliveries.map((row) => (
          <article
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div>
              <p className="text-sm">
                {row.data.to} · {row.data.state}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.kind === "account-mail"
                  ? "Account message"
                  : "Customer work order"}
              </p>
              {row.data.lastError && (
                <p className="text-xs text-destructive">{row.data.lastError}</p>
              )}
            </div>
            {["failed", "uncertain"].includes(row.data.state) && (
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    row.data.state === "uncertain" &&
                    !confirm(
                      "An earlier message may already have been delivered. Check the provider's delivery log first. Retry anyway?",
                    )
                  )
                    return;
                  void deskApi("/api/field/mail", {
                    retry: row.id,
                    confirmUncertain: row.data.state === "uncertain",
                    process: true,
                  })
                    .then(() => load())
                    .catch((error) => setMessage(error.message));
                }}
              >
                Retry delivery
              </Button>
            )}
          </article>
        ))}
      </section>
      {message && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
