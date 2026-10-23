"use client";
import { useEffect, useState } from "react";
import {
  defaultFormLayout,
  validateFormLayout,
  type FormLayout,
} from "./form-layout";
import { deskApi } from "./client-api";

const cacheKey = "zantech-form-layout-v1";
let pending: Promise<FormLayout> | undefined;
function refreshLayout() {
  return (pending ??= deskApi<{ layout: FormLayout }>("/api/form-layout")
    .then((data) => {
      const layout = validateFormLayout(data.layout);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(layout));
      } catch {
        /* Layout caching must not block entry. */
      }
      return layout;
    })
    .finally(() => {
      pending = undefined;
    }));
}
export function announceFormLayout(layout: FormLayout) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(layout));
  } catch {}
  window.dispatchEvent(new Event("zantech-form-layout"));
}
export function useFormLayout(enabled = true) {
  const [layout, setLayout] = useState<FormLayout>(defaultFormLayout);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const cached = () => {
      try {
        const value = localStorage.getItem(cacheKey);
        if (value && active) setLayout(validateFormLayout(JSON.parse(value)));
      } catch {}
    };
    const refresh = () => {
      if (navigator.onLine)
        void refreshLayout()
          .then((value) => {
            if (active) setLayout(value);
          })
          .catch(() => {});
    };
    cached();
    refresh();
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("storage", cached);
    window.addEventListener("zantech-form-layout", cached);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", cached);
      window.removeEventListener("zantech-form-layout", cached);
    };
  }, [enabled]);
  return layout;
}
