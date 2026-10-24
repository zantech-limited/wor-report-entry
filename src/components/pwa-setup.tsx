"use client";
import { useEffect, useRef, useState } from "react";
import { flushDeviceDrafts } from "@/lib/app-update";
import { Button } from "@/components/ui/button";

const reloadKey = "desk-sw-refreshed-at";
const channelName = "desk-app-update";
let reloading = false;

function refreshAfterUpdate() {
  if (reloading) return;
  try {
    const previous = Number(sessionStorage.getItem(reloadKey) || 0);
    if (Number.isFinite(previous) && Date.now() - previous < 15000) return;
  } catch {
    /* Private mode can block session storage; the in-memory flag still stops a loop. */
  }
  reloading = true;
  void flushDeviceDrafts().finally(() => {
    try {
      sessionStorage.setItem(reloadKey, String(Date.now()));
    } catch {
      /* The in-memory flag still stops a second reload in this document. */
    }
    location.reload();
  });
}

export function PwaSetup() {
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState<"saving" | "updating" | null>(null);
  const dismissed = useRef(false);
  const announced = useRef(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const fallbackTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !isSecureContext) return;
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event) => {
        if (event.data === "reload") refreshAfterUpdate();
      };
    } catch {
      /* This browser has no BroadcastChannel. Each tab still reloads on controllerchange. */
    }
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onController = () => {
      if (!hadController) return;
      if (announced.current) {
        try {
          channel?.postMessage("reload");
        } catch {
          /* Other open tabs still reload from their own controllerchange. */
        }
      }
      refreshAfterUpdate();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);

    function offer(worker: ServiceWorker | null) {
      if (!worker || worker.state !== "installed") return;
      const controller = navigator.serviceWorker.controller;
      if (!controller) {
        worker.postMessage("SKIP_WAITING");
        return;
      }
      if (controller === worker || dismissed.current) return;
      setWaiting(true);
    }

    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registrationRef.current = registration;
        offer(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") offer(installing);
          });
        });
        void registration.update().catch(() => {});
      })
      .catch(() => {});

    return () => {
      window.clearTimeout(fallbackTimer.current);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onController,
      );
      channel?.close();
    };
  }, []);

  async function updateNow() {
    if (busy) return;
    setBusy("saving");
    await flushDeviceDrafts();
    const registration =
      registrationRef.current ||
      (await navigator.serviceWorker.getRegistration());
    const worker = registration?.waiting;
    if (!worker) {
      setWaiting(false);
      setBusy(null);
      return;
    }
    setBusy("updating");
    announced.current = true;
    worker.postMessage("SKIP_WAITING");
    window.clearTimeout(fallbackTimer.current);
    fallbackTimer.current = window.setTimeout(() => {
      if (!announced.current) return;
      refreshAfterUpdate();
    }, 4000);
  }

  if (!waiting) return null;
  return (
    <div
      role="status"
      className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 rounded-lg border px-4 py-2 text-xs"
    >
      <p className="min-w-0 flex-1">
        {busy === "saving"
          ? "Saving drafts…"
          : busy === "updating"
            ? "Updating…"
            : "An app update is ready. Update now saves device drafts and refreshes open service desk tabs."}
      </p>
      <Button type="button" disabled={busy !== null} onClick={() => void updateNow()}>
        Update now
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy !== null}
        onClick={() => {
          dismissed.current = true;
          setWaiting(false);
        }}
      >
        Not now
      </Button>
    </div>
  );
}
