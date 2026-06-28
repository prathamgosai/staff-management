# Deploying WorkforceIQ to Render

This deploys four resources from the [`render.yaml`](render.yaml) blueprint:

| Resource | Render type | Purpose |
|----------|-------------|---------|
| `workforceiq-db` | PostgreSQL 16 | Application database |
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
3. Render reads `render.yaml` and shows the 4 resources. Click **Apply**.
4. It provisions the DB + Redis, then builds and deploys both web services. First build takes a few minutes.

The API's auth secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`) are auto-generated. The DB and Redis connection vars are wired automatically.

## 3. Confirm the public URLs match

The blueprint hard-codes the two cross-service URLs to the predicted hostnames:

- API `APP_URL` (CORS) → `https://workforceiq-web.onrender.com`
- Web `NEXT_PUBLIC_API_URL` → `https://workforceiq-api.onrender.com/api/v1`

If Render assigned different hostnames (it appends a suffix when a name is taken), open each service → **Environment**, correct those two values, and trigger a redeploy. `NEXT_PUBLIC_API_URL` is baked in at build time, so the **web** service must rebuild after changing it.

## 4. Load the database (one time)

The managed DB starts empty. Load the real data from the local dump (`.services/wfiq_full_clean.sql`, ~1 MB) using the **External** connection string from the `workforceiq-db` dashboard page (Render → workforceiq-db → "External Database URL").

```bash
cd "staff management project 1"
export DB_URL='postgresql://workforceiq_user:PASSWORD@HOST.singapore-postgres.render.com/workforceiq?sslmode=require'

# extensions the schema needs (TimescaleDB is NOT required)
psql "$DB_URL" -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;'

# load schema + data
psql "$DB_URL" -f .services/wfiq_full_clean.sql

# sanity check
psql "$DB_URL" -c 'SELECT count(*) FROM users;'   # expect 262
```

Use the Homebrew `psql` if your default one is older: `/opt/homebrew/opt/postgresql@16/bin/psql`.

> Prefer a clean install over real data? Load `assets/db/001_schema.sql`, `002_seed.sql`, then `003_real_staff.sql` instead of the dump.

## 5. Sign in

Open the web URL (e.g. `https://workforceiq-web.onrender.com`) and log in:

- **admin@workforceiq.app** / **Admin@123**

---

## Notes & caveats (Render free tier)

- **Cold starts**: free web services sleep after ~15 min idle; the first request then takes ~30–60 s to wake. Upgrade to a paid instance to keep them warm.
- **Free Postgres expires after 30 days** and is limited to 1 GB. Upgrade before then to avoid losing the database, or take backups (`pg_dump "$DB_URL" > backup.sql`).
- **Region**: all four resources are pinned to `singapore` so the API reaches the DB/Redis over Render's private network. Keep them in the same region.
- **TimescaleDB**: not available on Render Postgres, and not needed — it only powered the "PAX Prediction (coming soon)" feature, and `001_schema.sql` enables it optionally.
- **MinIO / object storage**: not used — profile photos are stored in the database.
- **ML service** (`apps/ml-service`): optional Python FastAPI, not deployed here (`ENABLE_ML_FORECASTING=false`). Add it later as a separate Render service if needed.
- **If the API can't reach Postgres** with an SSL error, the `DB_SSL=true` setting (uses `rejectUnauthorized: false`) covers Render's certs; if you ever switch to a non-SSL endpoint, set `DB_SSL=false`.
