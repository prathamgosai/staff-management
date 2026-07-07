/* BookendsShiftly service worker — offline support + app-shell caching.
   - Navigations: network-first; a successful page is cached so revisits work offline,
     and offline + uncached falls back to /offline.html.
   - API GETs (/api/*): network-first; the last successful response is cached as an
     offline fallback (online users always get fresh, live data).
   - Static assets (Next hashes them → immutable): cache-first.
   BUMP `CACHE` whenever this file, the precache list, the icons or the manifest change,
   or installed clients will keep serving stale assets (the activate step purges old keys). */
const CACHE = "bookendsshiftly-v4";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Best-effort: one missing asset must not fail the whole install.
      await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// On sign-out the app posts { type: "wfiq-logout" }; purge the cached /api/*
// responses so the next user on a shared device can't be served the previous
// user's data while offline (cache keys are URL-only, ignoring the bearer token).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "wfiq-logout") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const keys = await cache.keys();
        await Promise.all(
          keys.filter((r) => new URL(r.url).pathname.startsWith("/api/")).map((r) => cache.delete(r)),
        );
      })(),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API GETs — network-first, keep the latest success as an offline fallback.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match(req);
          return (
            cached ||
            new Response(JSON.stringify({ error: "offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Navigations — network-first; cache the shell so a revisited route works offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return (await cache.match(req)) || (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets (immutable, Next-hashed) — cache-first.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|jpg|jpeg|webp|gif|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      })(),
    );
  }
});
