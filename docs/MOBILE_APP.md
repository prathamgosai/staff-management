# Mobile: responsive web, installable PWA, and native apps

_Set up 2026-07-06._

BookendsShiftly now works on phones three ways, in increasing order of effort:

1. **Responsive web** — every page works in a mobile browser (done, nothing to do).
2. **Installable PWA** — "Add to Home Screen" gives an app-like, full-screen,
   offline-capable install (done, works automatically in production).
3. **Native Android/iOS apps** — real app-store binaries via Capacitor (scaffolded
   here; you finish the native build with the steps below).

---

## 1. Responsive web (done)

The layout is fully responsive: a hamburger menu + slide-out nav on small screens,
a fixed sidebar on desktop, and all wide tables scroll horizontally instead of
overflowing. Just open the site on a phone.

## 2. Installable PWA (done)

Added: `app/manifest.ts` (→ `/manifest.webmanifest`), app icons in `public/`
(`icon-192/512`, maskable, `apple-touch-icon`), a service worker (`public/sw.js`)
registered in production only, an offline fallback page, and viewport/theme-color
metadata.

**To install:** open the **deployed** site (PWA needs HTTPS + a production build —
it does *not* activate under `next dev`):

- **Android/Chrome:** menu → *Install app* / *Add to Home screen*.
- **iOS/Safari:** Share → *Add to Home Screen*.

It then launches full-screen with the BookendsShiftly icon, and the app shell shows
an offline page when there's no connection. API calls are never cached (always live
data). The SW is production-only so it never causes stale-cache confusion in dev.

> If you change icons or the manifest, bump `CACHE` in `public/sw.js` (e.g.
> `bookendsshiftly-v2`) so clients pick up the new assets.

## 3. Native Android & iOS (Capacitor — finish these steps)

Config is already committed at `apps/web/capacitor.config.json`. Because this is an
SSR + API-proxied Next.js app (not a static export), the native shell loads the
live hosted site (`server.url`). That means **web updates ship instantly** to
installed apps with no app-store review — you only rebuild the native shell when you
change icons, splash, plugins, or the native config.

### Prerequisites
- **Android:** Android Studio (JDK 17+).
- **iOS:** a Mac with Xcode.

### Steps (run in `apps/web`)
```bash
# 1. Install Capacitor (these are NOT added to package.json yet, to keep the
#    web deploy's lockfile untouched — install them when you start native work)
pnpm add @capacitor/core
pnpm add -D @capacitor/cli
pnpm add @capacitor/android @capacitor/ios

# 2. Add the native platforms (reads capacitor.config.json)
npx cap add android
npx cap add ios          # macOS only

# 3. Sync config/plugins into the native projects
npx cap sync

# 4. Open in the native IDEs to run on a device/emulator and build releases
npx cap open android     # → Android Studio → Run / Build APK/AAB
npx cap open ios         # → Xcode → Run / Archive
```

### App identity
- **appId:** `app.bookendsshiftly` (change before publishing if you own a different
  reverse-domain).
- **appName / icons:** set the launcher icon & splash in Android Studio / Xcode
  (or use `@capacitor/assets` to generate them from the `public/` icons).

### Notes
- The `webDir: "public"` is only a required placeholder; the app actually loads
  `server.url`. To ship a fully-bundled offline app instead, you'd need a static
  export, which this app can't do (SSR + `/api/*` rewrites).
- Keep `cleartext: false` — the production site is HTTPS.
- Store submission (Google Play / App Store) is a manual, account-gated step done
  from Android Studio / Xcode; Capacitor just produces the buildable projects.
