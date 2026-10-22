"use client";
import { useEffect, useState } from "react";
export function PwaSetup() {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !isSecureContext) return;
    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (registration.waiting) setWaiting(true);
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting) setWaiting(true);
          });
        });
      })
      .catch(() => {});
  }, []);
  return waiting ? (
    <p className="mx-auto max-w-6xl rounded-lg border px-4 py-2 text-xs">
      An app update is ready. Save your device drafts and close all service desk
      tabs to apply it safely.
    </p>
  ) : null;
}
