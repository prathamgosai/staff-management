# WorkforceIQ

A staff management platform for multi-outlet operations — scheduling, attendance, leave, allocation, staff documents, outlet capacity planning, and demand forecasting. Built as a pnpm + Turborepo monorepo.

## Stack

- **Web** (`apps/web`) — Next.js 14 (App Router), React 18, TanStack Query, Zustand, Radix UI
- **API** (`apps/api`) — NestJS 10, PostgreSQL 16, Redis + Bull
- **ML service** (`apps/ml-service`) — Python (FastAPI) for demand forecasting
- **Shared** (`packages/shared`) — types and utilities shared across apps

API feature modules: auth, staff, staff-documents, outlet, capacity, restaurant-config, staffing, predictions, transfer-recommendations, department, scheduling, attendance, leave, allocation, forecasting, dashboard, notification, roles.

**Capacity planning & documents:** each staff profile has a document vault (IDs/contracts; Aadhaar stored masked to last-4). Per-outlet capacity (tables + max pax) plus tunable staffing ratios drive a required-vs-actual dashboard, a new-outlet staffing planner, and a Phase-1 day-of-week demand forecast (import daily covers under **Settings → Import pax history**). All advisory — no auto-transfers or auto-roster changes.

**Workforce Intelligence:** a compliance-grade **employee documents** module (encrypted, versioned, audit-logged, expiry/missing tracking at `/documents`); per-restaurant **configuration & per-role staffing ratios**, edited per outlet at `/outlets/[id]`; a **staff predictor** (`/predictions`) that estimates headcount + payroll for a planned outlet; and an **AI staffing autopilot** on the dashboard that recommends cross-outlet transfers from forecast demand. Migrations `019`–`023`.

## Prerequisites

- **Node.js 20** — the project requires `>=20 <23`; `pnpm dev` is blocked on Node 23/24 (Next 14 dev is flaky there)
- pnpm >= 9
- PostgreSQL 16 — hosted (Supabase) or local
- Redis — for Bull queues (a bundled Windows Redis auto-starts on `pnpm dev`)

## Local development

> Windows-first, no Docker. The database is **Postgres 16 hosted on Supabase** (see
> `.env.example`); Redis is required for the Bull queues.

```powershell
# 1. Create your env file from the template, then fill it in
copy .env.example .env
#   • DB_*     -> your Supabase "Session pooler" host/user/password (DB_SSL=true),
#                 or a local Postgres (DB_HOST=localhost, DB_SSL=false)
#   • JWT_SECRET / JWT_REFRESH_SECRET -> unique random values (see .env.example comments)

# 2. Install dependencies (on Node 20 — NOT 23/24)
pnpm install

# 3. Run everything from the repo root — API :4000 (ts-node) + web :3000
pnpm dev
#   ensure-redis.js auto-starts a bundled Redis on Windows; free-port clears :4000.
```

Open http://localhost:3000. To run a single app: `pnpm --filter @workforceiq/api dev`
or `pnpm --filter @workforceiq/web dev`.

**Database migrations are applied BY HAND** — `pnpm db:migrate` / `pnpm db:seed` are *not*
wired (there is no committed runner). Apply the numbered files in `assets/db/` in order via the
**Supabase SQL editor** (or `psql`); each has a matching `_ROLLBACK.sql`. The hosted DB already
holds the seed + real-staff data.

### Default login

```
User: admin@workforceiq.app
Pass: see credential manager — never commit credentials
```

## Useful scripts (repo root)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run all apps in dev mode |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm db:migrate` | ⚠️ Not wired (no runner) — apply `assets/db/*.sql` by hand, in order |
| `pnpm db:seed` | ⚠️ Not wired — seed/real-staff data is loaded via the numbered SQL files |

## Deployment

Production deploys to [Render](https://render.com) from the [`render.yaml`](render.yaml) blueprint — Postgres 16, Redis (Key Value), the NestJS API, and the Next.js web app. See [DEPLOY-RENDER.md](DEPLOY-RENDER.md) for the full walkthrough.
