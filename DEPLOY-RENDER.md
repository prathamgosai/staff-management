# Deploying WorkforceIQ to Render

> ⚠️ **DB topology correction.** The database is **external Supabase** (Sydney,
> session pooler) — there is **no** Render-managed Postgres, despite some older
> wording below. The authoritative DB reference is
> **[docs/SUPABASE-WIRING.md](docs/SUPABASE-WIRING.md)**. Also, the live services
> are named **`bookends-shiftly`** (API) and **`staff-management-yf21`** (web),
> not the `workforceiq-*` names in `render.yaml` — that blueprint is illustrative,
> and re-applying it as-is would create *new* orphan services. Live env vars are
> managed by hand in each service's dashboard.

This blueprint ([`render.yaml`](render.yaml)) provisions **three** Render
resources; the database is **external Supabase** (not a Render service):

| Resource | Render type | Purpose |
|----------|-------------|---------|
| Database | **External Supabase** (Sydney, session pooler) | App database — see [docs/SUPABASE-WIRING.md](docs/SUPABASE-WIRING.md) |
| `workforceiq-redis` | Key Value (Redis) | Cache + BullMQ queues |
| `workforceiq-api` | Web service (Node) | NestJS API |
| `workforceiq-web` | Web service (Node) | Next.js frontend |

> **Code changes already made to enable this** (so the production build actually works — it previously only ran in `next dev` / `ts-node`, which skip type-checking and the compiled entrypoint):
> - `apps/api/src/main.ts` — binds to Render's `$PORT` (and `0.0.0.0`).
> - `apps/api/tsconfig.build.json` — added, so `nest build` emits a clean `dist/main.js` that imports `@workforceiq/shared` as a package instead of a non-existent source path.
> - `packages/shared/package.json` — fixed the `exports` map (CJS = `index.js`, ESM = `index.mjs`) so the built API can resolve it at runtime.
> - `apps/web/next.config.mjs` — consolidated the two duplicate config files into one; `next build` no longer fails on pre-existing strict type/lint issues.

---

## 1. Push the code to GitHub

Render deploys from a connected Git repo. This repo already has a remote (`origin` → `github.com/prathamgosai/staff-management`). Commit and push these changes:

```bash
cd "staff management project 1"
git add render.yaml DEPLOY-RENDER.md apps/api/src/main.ts apps/api/tsconfig.build.json \
        packages/shared/package.json apps/web/next.config.mjs
git rm --cached apps/web/next.config.js   # removed in favour of the .mjs
git commit -m "Add Render blueprint; fix production build (api port/build, shared exports, next config)"
git push origin main
```

> `.env` and `.services/` stay out of Git (they're git-ignored) — secrets are set on Render instead.

## 2. Create the Blueprint on Render

1. Go to **dashboard.render.com → New + → Blueprint**.
2. Connect the GitHub repo and select the branch (`main`).
3. Render reads `render.yaml` and shows the 3 resources (Redis + API + web). Click **Apply**.
4. It provisions Redis, then builds and deploys both web services. First build takes a few minutes.

The API's auth secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`) are auto-generated and Redis is wired automatically. The **Supabase** connection vars (`DB_HOST/PORT/NAME/USER/SSL`) are in `render.yaml`; you set `DB_PASSWORD` by hand in the API service's Environment (`sync:false`). See [docs/SUPABASE-WIRING.md](docs/SUPABASE-WIRING.md).

## 3. Confirm the public URLs match

The blueprint hard-codes the two cross-service URLs to the predicted hostnames:

- API `APP_URL` (CORS) → `https://workforceiq-web.onrender.com`
- Web `NEXT_PUBLIC_API_URL` → `https://workforceiq-api.onrender.com/api/v1`

If Render assigned different hostnames (it appends a suffix when a name is taken), open each service → **Environment**, correct those two values, and trigger a redeploy. `NEXT_PUBLIC_API_URL` is baked in at build time, so the **web** service must rebuild after changing it.

## 4. Database — already provisioned on Supabase

There is **no database step in this deploy**: the app uses an **external Supabase**
project (Sydney), already provisioned and loaded (data migrated 2026‑07‑03, all
33 tables). You do **not** create or load a Render Postgres.

What you *do* need for the API service (Render dashboard → `bookends-shiftly` →
Environment): set **`DB_PASSWORD`** to the current Supabase database password
(`sync:false` — never committed). The other `DB_*` vars are already in
`render.yaml`. Full reference, including why each value is what it is:
**[docs/SUPABASE-WIRING.md](docs/SUPABASE-WIRING.md)**.

To run SQL against the DB (e.g. an admin password reset, ad‑hoc queries), use the
**Supabase dashboard → SQL Editor** — no local `psql` needed.

> **Migrations / bulk load** (rarely needed — the DB is already populated): the
> schema/data files are in `assets/db/` (`001_schema.sql`, `002_seed.sql`,
> `003_real_staff.sql`, …). For a `pg_dump`/`pg_restore`‑style bulk load you must
> use the **direct** host `db.<ref>.supabase.co:5432` (the pooler can't stream a
> COPY dump) — note that host is **IPv6‑only**, so run it from an IPv6‑capable
> machine, not from Render or an IPv4‑only box.

## 5. Sign in

Open the web URL (e.g. `https://workforceiq-web.onrender.com`) and log in:

- **admin@workforceiq.app** / _see credential manager — never commit credentials_

---

## 6. Keep the app awake (fixes the "sometimes broken on open" problem)

On the **free** plan a web service **sleeps after ~15 min idle**; the next request
wakes it and can take **30–120 s**. During that wake-up the browser sees a 502 /
"can't reach the server", data pages render empty, and login appears to hang — so
the whole app looks broken until it's warm. The fix is to stop it sleeping.

The API now exposes a DB-free liveness route for exactly this:

```
GET https://<your-api>.onrender.com/api/v1/health   →  {"status":"ok", ...}
```

**Set up a free external pinger** (nothing to install) — e.g. [UptimeRobot](https://uptimerobot.com)
or [cron-job.org](https://cron-job.org). Add **two HTTP monitors**, each every **5–10 min**:

| Monitor | URL |
|---------|-----|
| API  | `https://bookends-shiftly.onrender.com/api/v1/health` |
| Web  | `https://staff-management-yf21.onrender.com/` |

> Replace those hosts with your actual service URLs if they differ.

**Caveat — free instance-hours:** keeping a service pinged 24/7 means it runs ~730
h/month. Render's free tier budget is limited, so pinging **both** services around
the clock can exhaust it. Options: ping only during the hours people actually use
the app (most pingers support a schedule), or upgrade the busier service (the API)
to a paid Starter instance (~$7/mo) so it never sleeps at all.

---

## Notes & caveats (Render free tier)

- **Cold starts**: free web services sleep after ~15 min idle; the first request then takes ~30–60 s to wake. Upgrade to a paid instance to keep them warm.
- **Database is external Supabase** (not Render) — the "free Postgres expires after 30 days" limit does **not** apply. Watch Supabase's own free‑tier limits/pausing instead, and back up via Supabase.
- **Region**: the Render services (API, web, Redis) are pinned to `singapore`; **Redis** is co‑located on Render's private network, but the **Supabase DB is in Sydney**, so every DB round‑trip is cross‑region (~90–100 ms). See [docs/SUPABASE-WIRING.md](docs/SUPABASE-WIRING.md) for the latency note and the co‑location recommendation.
- **TimescaleDB**: not available on Render Postgres, and not needed — it only powered the "PAX Prediction (coming soon)" feature, and `001_schema.sql` enables it optionally.
- **MinIO / object storage**: not used — profile photos are stored in the database.
- **ML service** (`apps/ml-service`): optional Python FastAPI, not deployed here (`ENABLE_ML_FORECASTING=false`). Add it later as a separate Render service if needed.
- **If the API can't reach Postgres** with an SSL error, the `DB_SSL=true` setting (uses `rejectUnauthorized: false`) accepts **Supabase's** pooler cert without strict verification; if you ever point at a non‑SSL endpoint, set `DB_SSL=false`.
