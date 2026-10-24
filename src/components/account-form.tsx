"use client";
import { useState, useEffect, type FormEvent } from "react";
import Image from "next/image";
import { deskApi } from "@/lib/client-api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function AccountForm({ setup = false }: { setup?: boolean }) {
  const [mode, setMode] = useState("signin"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [messageRole, setMessageRole] = useState<"status" | "alert">("status");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("token")) {
      setMode("reset");
      setToken(params.get("token")!);
    }
    if (!setup)
      void deskApi<{ ready: boolean }>("/api/setup")
        .then((data) => {
          if (!data.ready) location.assign("/setup");
        })
        .catch(() => {});
  }, [setup]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setMessageRole("status");
    try {
      if (setup) {
        await deskApi("/api/setup", { name, email, password, token });
        setMessage("Administrator created. You can now sign in.");
        location.assign("/login");
      } else if (mode === "register") {
        await deskApi("/api/auth/sign-up/email", {
          name,
          email,
          password,
          callbackURL: location.origin + "/login",
        });
        setMessage(
          "Registration submitted. Verify your email and wait for Admin approval before accessing work orders.",
        );
      } else if (mode === "forgot") {
        await deskApi("/api/auth/request-password-reset", {
          email,
          redirectTo: location.origin + "/login",
        });
        setMessage(
          "If that account exists, password reset instructions will be queued for email delivery.",
        );
      } else if (mode === "reset") {
        await deskApi("/api/auth/reset-password", {
          token,
          newPassword: password,
        });
        setMessage("Password changed. Sign in with your new password.");
        setMode("signin");
        history.replaceState(null, "", "/login");
      } else {
        await deskApi("/api/auth/sign-in/email", { email, password });
        try {
          await deskApi("/api/identity");
          location.assign("/field");
        } catch {
          setMessageRole("alert");
          setMessage(
            "Your account is awaiting approval or is inactive. Contact Admin.",
          );
        }
      }
    } catch (error) {
      setMessageRole("alert");
      setMessage(
        error instanceof Error ? error.message : "Unable to continue.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto my-12 w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
      <Image
        src="/icons/zantech-logo.png"
        alt="Zantech"
        width={96}
        height={96}
        priority
        unoptimized
        className="mb-4 size-24"
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Zantech Limited
      </p>
      <h1 className="my-3 text-2xl font-semibold">
        {setup
          ? "Create the first administrator"
          : mode === "register"
            ? "Register as a technician"
            : mode === "forgot"
              ? "Reset your password"
              : mode === "reset"
                ? "Choose a new password"
                : "Sign in to your service desk"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {setup
          ? "Use the private bootstrap token. Existing workbook data is retained."
          : "Use your email and password. New registrations require approval."}
      </p>
      <form onSubmit={submit} className="grid gap-4">
        {(setup || mode === "register") && (
          <label className="grid gap-1 text-sm">
            Full name
            <Input
              required
              maxLength={255}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {mode !== "reset" && (
          <label className="grid gap-1 text-sm">
            Email
            <Input
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label className="grid gap-1 text-sm">
            Password
            <Input
              type="password"
              required
              minLength={mode === "signin" ? 1 : 12}
              maxLength={128}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {setup && (
          <label className="grid gap-1 text-sm">
            Bootstrap token
            <Input
              type="password"
              required
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
        )}
        <Button type="submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : setup
              ? "Create administrator"
              : mode === "signin"
                ? "Sign in"
                : mode === "register"
                  ? "Submit registration"
                  : "Continue"}
        </Button>
      </form>
      {message && (
        <p role={messageRole} className="mt-4 rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      {!setup && (
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <button
            type="button"
            className="inline-flex min-h-11 items-center underline"
            onClick={() => {
              setMode(mode === "register" ? "signin" : "register");
              setMessage("");
            }}
          >
            {mode === "register" ? "Already registered? Sign in" : "Register"}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center underline"
            onClick={() => {
              setMode(mode === "forgot" ? "signin" : "forgot");
              setMessage("");
            }}
          >
            {mode === "forgot" ? "Back to sign in" : "Forgot password?"}
          </button>
        </div>
      )}
    </section>
  );
}
