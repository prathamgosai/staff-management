"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in PRODUCTION only. Skipping it in dev avoids the
 * classic "my change isn't showing" stale-cache confusion while working locally.
 * Failures are swallowed — a missing SW must never break the app.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
