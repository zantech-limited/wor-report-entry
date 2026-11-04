"use client";

import { deskApi } from "./client-api";

/** Deletes the server session and returns the browser to sign-in. */
export async function endDeskSession() {
  const result = await deskApi<{ success?: boolean }>("/api/auth/sign-out", {});
  if (result?.success !== true)
    throw new Error("The server did not end this session. You are still signed in.");
  try {
    localStorage.removeItem("zantech-device-identity");
  } catch {
    /* Private mode can block storage. The session cookie is already cleared. */
  }
  location.assign("/login");
}
