# Supabase ↔ Render wiring (verified reference)

**Status: ✅ CORRECT and production‑safe.** Verified end‑to‑end — the live API
authenticates logins by querying the Supabase `users` table (returns a clean
`401` for a wrong password), which proves host, port, user, database, password,
SSL, pooler mode, and IPv4 reachability are all correct on the running service.

> This document is the **source of truth for the database topology.** Where
> `DEPLOY-RENDER.md` describes a Render‑managed `workforceiq-db` PostgreSQL
> service, that is **stale/incorrect** — there is no Render Postgres. The
> database is **external Supabase**, as described here.

Last verified: 2026‑07‑08 (multi‑agent audit of `.env`, `render.yaml`,
`apps/api/src/database/database.module.ts`, `DEPLOY-RENDER.md`).

---

## 1. Topology

```
Browser ──HTTPS──▶  Web service (Next.js)          Render · Singapore
                    staff-management-yf21           repo: prathamgosai/staff-management
                      │  same-origin /api/* proxy (next.config.mjs)
                      ▼
                    API service (NestJS, pg Pool)   Render · Singapore
                    bookends-shiftly                repo: bookendskg/Bookends-Shiftly
                      │  TLS, IPv4, session pooler
                      ▼
                    Supabase Postgres               Supabase · Sydney (ap-southeast-2)
                    aws-1-ap-southeast-2.pooler.supabase.com:5432   (Supavisor SESSION pooler)
```

- **Redis** (BullMQ / cache) is a Render Key Value service, **co‑located** with
  the API in Singapore on Render's private network — *not* cross‑region.
- **Only the database hop is cross‑region** (Singapore → Sydney).

---

## 2. Environment‑variable reference (authoritative)

| Var | Value | Where it's set | Notes |
|---|---|---|---|
| `DB_HOST` | `aws-1-ap-southeast-2.pooler.supabase.com` | `.env` (dev) · Render dashboard (prod) | Supabase **pooler** host — reachable over **IPv4**. Do **not** switch to `db.<ref>.supabase.co` (IPv6‑only; fails on Render). |
| `DB_PORT` | `5432` | both | **Session** pooler mode (not `6543` = transaction mode). Correct for a long‑lived `pg.Pool` / prepared statements. |
| `DB_NAME` | `postgres` | both | Supabase's app database is always `postgres`; the pooler routes tenants by the username prefix. |
| `DB_USER` | `postgres.<projectref>` | both | The pooler **requires** the `postgres.<ref>` format; a bare `postgres` fails auth. |
| `DB_PASSWORD` | *(secret)* | `.env` (dev) · Render dashboard **`sync:false`** (prod) | Never committed. See the hardening note — the current value is weak and should be rotated. |
| `DB_SSL` | `true` | both | Supabase requires TLS. Code enables SSL **only** on the exact string `"true"`. |
| `DB_POOL_MAX` | prod `8` | Render (prod only) | Session mode holds one Postgres backend per pooled connection; `8` keeps within the free‑tier budget. **`.env` should set this too** (see §5). |
| `DB_CONNECT_TIMEOUT_MS` | *(unset → 15000)* | code default | Generous for the cross‑region TLS handshake. Fine as‑is. |

Everything above matches exactly between `.env` and `render.yaml`, and matches
the confirmed‑working live connection.

> **Secrets never live in committed files.** `render.yaml` keeps `DB_PASSWORD`
> and `APP_URL` as `sync:false` (set in the Render dashboard) and generates the
> JWT secrets with `generateValue:true`. `.env` is git‑ignored. Keep this
> pattern for any future secret (WhatsApp / SendGrid / AWS keys).

---

## 3. Why each Supabase‑specific choice is correct

- **Pooler host, not the direct host.** Supabase's direct `db.<ref>.supabase.co`
  has been **IPv6‑only** since Jan 2024. Render's outbound networking is IPv4,
  so the direct host would fail without a paid dedicated‑IPv4 add‑on. The
  `…pooler.supabase.com` host is IPv4‑safe. ✅
- **Port 5432 (session mode), not 6543 (transaction mode).** The app holds a
  persistent `pg.Pool`; session mode preserves session state and supports
  prepared statements. Transaction mode would break named/prepared statements.
  (Repo‑wide check: `6543` appears nowhere.) ✅
- **`DB_USER = postgres.<ref>`** — the tenant‑qualified format Supavisor
  requires. ✅
- **`DB_NAME = postgres`** — the only correct app database on Supabase. ✅
- **SSL on** — required by Supabase; the app sets it. ✅ (Caveat: cert
  validation is disabled — see §5.)

---

## 4. Connection pool behavior (`database.module.ts`)

Confirmed sound for a remote pooler:

- `connectionTimeoutMillis: 15000` — generous for cross‑region TLS setup.
- `keepAlive: true` — stops NAT/firewall from silently dropping idle sockets.
- `idleTimeoutMillis: 30000` — client‑side idle reaper (**see the warm‑socket
  note in §5**).
- **Transient‑connect retry** (`ENOTFOUND` / `EAI_AGAIN` / `ECONNREFUSED`, 3
  attempts, 250 ms × n backoff) — correctly restricted to *connect‑time* errors,
  so a write is **never** re‑executed. ✅
- `pool.on('error', …)` registered — a background client error is logged, not a
  process crash. ✅
- All `pool.connect()` transaction sites pair with `finally { client.release() }`
  — **no connection leak.** ✅

---

## 5. Hardening backlog (nothing here breaks connectivity)

Prioritized. None of these are wiring defects — the connection works today.

### 🔴 1. Rotate the database password (only genuinely urgent item — security)
The current DB password is a weak, personal‑style password, and the endpoint
(`host:5432`), database, and username are all committed to a **public** repo —
so the password is the *only* barrier on an internet‑reachable pooler.

**Fix:**
1. Supabase → **Settings → Database → Reset database password**. Use 32+ random
   chars, e.g. `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
2. Update `DB_PASSWORD` in **both** the Render dashboard (API service, `sync:false`)
   **and** local `.env`.
3. Prefer a **least‑privilege app role** over the `postgres.<ref>` owner role.
4. Enable **Supabase network restrictions / IP allow‑list** so knowing the
   public endpoint isn't enough to reach it.

### 🟠 2. Keep one DB socket warm + add query timeouts (fixes "login slow after idle")
This directly explains the *"first login after the site's been idle is slow / hangs"*
symptom. The keep‑warm pinger hits the **DB‑free** `/api/v1/health` route, so it
keeps the **dyno** awake but **not a DB connection** — and `idleTimeoutMillis:30000`
closes idle sockets after 30 s. So the first query after any lull pays a full
cross‑region TCP+TLS+pooler‑auth reconnect (Singapore↔Sydney).

**Fix (in `database.module.ts`):**
- Raise `idleTimeoutMillis` to a few minutes, **and** run a low‑frequency
  `SELECT 1` (or a `/health/db` route pinged every ~1–4 min) so a socket stays
  open. Keep the *primary* keep‑warm ping on the DB‑free route so Render's health
  check never depends on the DB.
- Add `statement_timeout: 15000` and/or `query_timeout: 15000` so a hung
  cross‑region query can't pin a scarce session‑pooler connection.
- Add `application_name: 'workforceiq-api'` for observability in
  `pg_stat_activity` / the Supabase dashboard.

### 🟠 3. Co‑locate the database (latency)
DB is in **Sydney**; Render is in **Singapore** — every DB round‑trip crosses
regions (~90–100 ms RTT baseline). Render has no Sydney region, so **move the
Supabase project to Singapore (ap‑southeast‑1)** to eliminate the cross‑region
tax. Until then, minimize sequential blocking round‑trips per request.

### 🟡 Minor / accept‑and‑document
- **`ssl: { rejectUnauthorized: false }`** — encrypted but the cert isn't
  verified (no MITM protection). This is the standard Supabase pooler pattern;
  optionally pin Supabase's CA: `ssl: { ca: <pem>, rejectUnauthorized: true }`.
- **`DB_POOL_MAX` dev/prod parity** — `.env` sets none, so local dev falls to the
  code default of **20** against the *same* free‑tier pooler prod uses. Add
  `DB_POOL_MAX=5` to `.env` (or point dev at the commented‑out local Postgres
  block in `.env`).
- **`config.get<number>()` is cosmetic** — env values arrive as strings; `pg`
  coerces them. Works, but not a real parse.

---

## 6. Known documentation drift to fix

`DEPLOY-RENDER.md` describes a database topology that **does not exist**:
- It lists a Render‑managed `workforceiq-db` PostgreSQL 16 service and a
  "four resources" stack — but `render.yaml` provisions **no** Postgres (only
  Redis + 2 web services). The DB is external Supabase.
- Section 4 loads data into `HOST.singapore-postgres.render.com` — wrong host.
- "Free Postgres expires after 30 days" — **irrelevant** to Supabase.
- `render.yaml` names services `workforceiq-api/-web`, but the live services are
  `bookends-shiftly` and `staff-management-yf21` — re‑applying the blueprint
  would create **orphan** services rather than update the running ones.

➡️ Treat **this file** as authoritative for the DB. `DEPLOY-RENDER.md` should be
corrected (or its DB section removed) to avoid someone standing up the wrong
database.

---

## 7. Quick verification checklist

- [ ] Live login succeeds → wiring is healthy (the definitive test).
- [ ] Render API `DB_PASSWORD` (dashboard, `sync:false`) matches the **current**
      Supabase password. *(Can't be checked from code — only the running service
      knows.)*
- [ ] `DB_HOST` is the `…pooler.supabase.com` host (IPv4), port `5432`.
- [ ] `DB_USER` is `postgres.<projectref>`, `DB_NAME` is `postgres`, `DB_SSL=true`.
- [ ] Password rotated to 32+ random chars; Supabase network restrictions on.
