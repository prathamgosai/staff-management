# PR: Hardening + extensions (`feat/roadmap-hardening` → `main`)

17 commits. A focused hardening pass on a solid core — security, performance, data
integrity, observability, a complete audit trail, a test safety net, and two product
extensions — from an adversarially-verified improvement review. **88 files, ~2,600 insertions.**

> ⚠️ Merging deploys the **web** app to production (Render). The **API** deploys from a
> separate repo — see the repo-consolidation step in `docs/OWNER-ACTIONS-ROADMAP.md`.

## What changed

**Security**
- Fail-closed global `JwtAuthGuard` — every route requires auth unless `@Public()` (4 genuinely-public routes marked). `bac0d02`, `26b32da`
- Closed RBAC outlet/tenant-scoping + permission gaps on allocation, outlet, dashboard, forecasting; `reviewTransfer` made atomic. `bac0d02`
- class-validator DTOs for all 34 inline `@Body()` handlers. `0c1b560`
- pg-aware exception filter (correct HTTP codes + `x-request-id`). `26b32da`

**Performance** (DB is cross-region/Sydney — round-trips are the bottleneck)
- Schedule generation: ~240 sequential writes → ~5 set-based (was ~110s). `fdc181f`
- Staffing dashboard read-cache (fixes pool saturation starving login). `61b8ae2`
- `assignStaff` batched to one upsert. `26b32da`

**Integrity / correctness**
- Migration 025: login/refresh indexes, divisor `CHECK`s, out-of-band column reconcile, audit index. `f7b62c9`, `a470986`
- IST timezone pinned (DB session + Node) — fixes midnight date-bucketing. `a66d870`
- Divisor guards so a `0` ratio can't produce `Infinity`. `26b32da`

**Observability**
- Slow-query logging + the request-id error filter above. `a66d870`

**Audit trail (complete vertical)**
- Fail-safe `AuditService` on transfer/leave/permission + staff-terminate/password-reset/outlets/role/registration changes. `c02c0a2`, `82f67cc`
- `GET /audit` (tenant-scoped, `accounts:manage`) + web `/audit` page. `a470986`, `32ccd02`

**Product extensions**
- Document-expiry reminders: daily job → in-app alerts to staff + outlet heads, idempotent, WhatsApp-off by default. `9badddd`
- Accessible `Modal` wrapper (foundation for migrating the 7 hand-rolled modals). `45fe9b3`

**Tooling / tests**
- CI workflow (lint → typecheck → test → build). `f7b62c9`
- 99 unit + 14 RBAC contract tests + a 10-case full app-boot e2e (boots the real app vs a
  local Postgres; proves within- AND cross-tenant scope, atomic transfer, audit read/write). `c8b1627`, `911e8b2`, `b148fe0`

## Verification
- API `tsc` clean · web `tsc` clean · **99 unit + 14 contract + 10 e2e tests green** · API
  boots and behaves correctly on manual probes · D1 SQL validated against the real engine.

## Deploy / migration notes (see `docs/OWNER-ACTIONS-ROADMAP.md`)
- Apply `docs/APPLY-024` + `APPLY-025` in Supabase (idempotent).
- Set `DOCUMENT_ENCRYPTION_KEY`; consolidate the two-repo split-brain; rotate DB password + backups.
- Env knobs (all have safe defaults): `APP_TZ`, `DB_SLOW_QUERY_MS`, `STAFFING_CACHE_TTL_MS`,
  `DOC_EXPIRY_REMINDER_CRON`/`_DAYS`.
- Delete the QA test row: `DELETE FROM users WHERE lower(email)='nobody-xyz@example.com';`

## Review pointers
- Behavior-changing: the global fail-closed guard (check the 4 `@Public` routes are right for you)
  and the DTO whitelisting (a client field not in a DTO now 400s — exercise real UI flows in staging).
- Not verifiable in CI here: the web bundler won't run on Node 24, so the `/audit` page and the
  `Modal` migrations need a browser pass on Node 20.
