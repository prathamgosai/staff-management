# WorkforceIQ

A staff management platform for multi-outlet operations — scheduling, attendance, leave, allocation, and demand forecasting. Built as a pnpm + Turborepo monorepo.

## Stack

- **Web** (`apps/web`) — Next.js 14 (App Router), React 18, TanStack Query, Zustand, Radix UI
- **API** (`apps/api`) — NestJS 10, PostgreSQL 16, Redis + BullMQ
- **ML service** (`apps/ml-service`) — Python (FastAPI) for demand forecasting
- **Shared** (`packages/shared`) — types and utilities shared across apps

API feature modules: auth, staff, outlet, department, scheduling, attendance, leave, allocation, forecasting, dashboard, notification.

## Prerequisites

- Node.js >= 20, pnpm >= 9
- PostgreSQL 16
- Redis

## Local development

```bash
cd "staff management project 1"

# 1. Start Postgres 16 on port 5433 (Redis usually auto-starts)
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 \
  -o "-p 5433" -l /opt/homebrew/var/log/pg16-5433.log start

# 2. Install dependencies
pnpm install

# 3. Run database migrations and seed data
pnpm db:migrate
pnpm db:seed
```

Then start the apps in two terminals:

```bash
cd apps/api && pnpm dev      # http://localhost:4000
cd apps/web && pnpm dev      # http://localhost:3000
```

You can also run everything from the repo root with `pnpm dev` (Turborepo).

### Default login

```
User: admin@workforceiq.app
Pass: Admin@123
```

## Useful scripts (repo root)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run all apps in dev mode |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm db:migrate` | Run API database migrations |
| `pnpm db:seed` | Seed the database |

## Deployment

Production deploys to [Render](https://render.com) from the [`render.yaml`](render.yaml) blueprint — Postgres 16, Redis (Key Value), the NestJS API, and the Next.js web app. See [DEPLOY-RENDER.md](DEPLOY-RENDER.md) for the full walkthrough.
