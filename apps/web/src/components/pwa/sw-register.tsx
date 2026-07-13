"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in PRODUCTION only. Skipping it in dev avoids the
 * classic "my change isn't showing" stale-cache confusion while working locally.
 * Failures are swallowed — a missing SW must never break the app.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // DEV: actively remove any service worker left over from a previous production run on
      // this origin, and purge its caches. Otherwise it serves stale cache-first Next chunks
      // and your code changes never appear (the "my change isn't showing" trap).
      navigator.serviceWorker.getRegistrations?.()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if (typeof caches !== "undefined") {
        caches.keys?.().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
      }
      return;
    }

    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
