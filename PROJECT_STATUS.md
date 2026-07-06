# WorkforceIQ — Project Status & Work Report

> AI-Powered Restaurant Workforce & Operations Planning System
> Maintained status document. Last updated: **2026-07-02**.
> Snapshot: 13 commits · branch `main` · working tree clean · first commit 2026-06-26, latest 2026-07-01.

---

## 1. What this project is

A staff / workforce management platform for a multi-outlet restaurant group (Bookends group — brand shown in-app as **WorkforceIQ**). It handles the employee directory, outlets & departments, weekly shift rostering, attendance, leave, forecasting, allocation, role-based access control, and account/permission administration.

- **Repo:** `E:\staff management project 1`
- **Type:** pnpm monorepo (Turborepo)
- **Database hosted on Supabase** (Postgres via session pooler); Redis still required for Bull queues. See §6.

---

## 2. Tech stack

| Layer | Stack |
|---|---|
| **API** | NestJS (TypeScript) modular monolith · port 4000 · raw `pg` Pool (NO ORM) · parameterized SQL |
| **Web** | Next.js 14 · React 18 · Tailwind · TanStack Query v5 · Zustand · Radix UI · Recharts · FullCalendar · dnd-kit · react-hook-form + zod · port 3000 |
| **ML** | Python FastAPI forecasting service · port 8000 (Phase 1 rule-based live; Phase 2 Prophet/XGBoost stubbed) |
| **Shared** | `packages/shared` — TS types, enums, RBAC constants |
| **DB** | PostgreSQL 16 (+ optional TimescaleDB `pax_data` hypertable) · UUID PKs · `tenant_id` everywhere · hard delete (no soft-delete) |
| **Queue** | Redis + legacy Bull (`@nestjs/bull`, NOT BullMQ) — queues: `notifications`, `auto-schedule` |
| **Auth** | JWT + real refresh-token rotation · `@nestjs/throttler` rate limiting |
| **Notifications** | WhatsApp (Meta Graph API) + Email (SES/SendGrid) |

---

## 3. Architecture map

**API modules** (`apps/api/src/modules/`):
`auth`, `staff`, `outlet`, `department`, `scheduling`, `attendance`, `leave`, `forecasting`, `allocation`, `notification`, `dashboard`, `roles`

**Web pages** (`apps/web/src/app/(dashboard)/`):
`dashboard`, `staff`, `outlets`, `scheduling`, `attendance`, `leave`, `allocation`, `reports`, `accounts`, `approvals`, `account-types`

**DB migrations** (`assets/db/`, numbered, most with `_ROLLBACK`):
`001_schema` → `011_staff_shift_overrides` (11 migrations + seed + real-staff data)

---

## 4. Work completed (chronological, by commit)

| # | Commit | Summary |
|---|---|---|
| 1 | `8d807a7` | Full WorkforceIQ monorepo scaffold — API, web, ML service, DB schema (126 files, ~24.8k lines) |
| 2 | `20d4ca6` | Staff profile photo upload (avatars stored base64 in DB) |
| 3 | `0303004` | Editable staff status, contact, Employee ID |
| 4 | `d872eda` | Registration/approval flow additions |
| 5 | `b81d294` | Role-based access control for staff management |
| 6 | `b660466` | Super-admin Staff Accounts page + no-Docker launcher + EADDRINUSE fix |
| 7 | `d74f6f7` | Surface `AggregateError` details in rotation scheduler logs |
| 8 | `da6d419` | Fix weekly roster generation + manual shift-time editor |
| 9 | `6e49313` | RBAC, account types & permissions management; attendance fix |
| 10 | `9943bf4` | Per-staff shift move + full dark-mode theming |

### Feature areas delivered

**Employee directory & data (real data loaded)**
- ~371 active staff imported from `Employee Directory _1.xlsx`; post/section matched by name against `Restaurant Staffing.xlsx`.
- Live-DB contact backfill (3 passes): real Employee Codes, phones (239/260), emails (207), migrations `004`–`006` (+ rollbacks + audit CSV).
- Staff logins switched to real emails where unique (204/256), default password `Admin@123`, migration `007`.
- 6 resigned staff flagged from exit sheets.
- Deliverable: `Active Staff by Restaurant and Post.xlsx/.csv` (grouped roster + flat table + summary matrix).

**Scheduling / weekly roster**
- Auto rotation: 3 shift templates (A/B/C) × 7 days = 21 shifts/week, staff split into 3 rotation groups, rotated weekly.
- Local-Monday week-key invariant (frontend/backend must match); startup backfill retries until Postgres reachable.
- Manual shift-time override (`PUT /scheduling/shift-templates/:id`).
- Per-staff manual move to a shift, pinned in `staff_shift_overrides` (migration `011`) — survives future rotations (managers only, `schedule:write`).

**RBAC & account administration**
- Account types restructured to `super_admin, admin, hr, head_of_house, chef, employee` (migration `010`).
- DB-backed editable role→permission matrix (`role_permissions`, migration `008`); live per-request enforcement via `JwtStrategy` (no re-login needed after edits).
- `super_admin` hardcoded to `*` (can never be locked out).
- **Account Types & Permissions** admin page (`/account-types`) — edit permissions, view users per type.
- Staff Accounts page bulk role change (super_admin + HR only); super-admin password protected.
- HR admin login created; HR granted full admin peer access (migrations `009`).

**Security hardening (2026-06-29)**
- Rotated all secrets (JWT, refresh, DB password) — old defaults dead.
- Real refresh-token rotation (SHA-256 hashed, single-use; API restart = re-login).
- Forced password change flow (`must_change_password`), hardened change-password page after multi-agent audit.
- Rate limiting: global 300/min + login 5/min/IP.

**Attendance / leave / dashboard / forecasting / allocation** — modules scaffolded and wired; attendance bug fixed in commit 9.

**UI / theming**
- Full light/dark mode via next-themes + semantic Tailwind tokens in `globals.css`; ~1197 hardcoded colors converted across all pages.

**Infra / DX**
- No-Docker local run: portable Postgres 16 + Redis under `.services/`, `start-services.ps1` / `stop-services.ps1`.
- EADDRINUSE + IPv4 (`127.0.0.1` vs `localhost`/`::1`) fixes; `AggregateError` unwrapping in scheduler logs.

---

## 5. Known gaps / open items

- **RBAC data-scoping — server-side outlet scoping now enforced** (Task 0) across staff/attendance/leave/scheduling via `common/auth/outlet-scope.ts`: super_admin/admin/hr → all tenant outlets; head_of_house/chef/employee → their own outlet(s); an out-of-scope client `outletId` is rejected (403) and unscoped list reads are filtered to the caller's outlets. Also closed several cross-tenant leaks (endpoints that previously had no `tenant_id` filter). Residual: scheduling uses controller-level outlet guards rather than a deep per-query tenant rewrite (safe while single-tenant); no department scoping (`users` has no `department_id`).
- **Seed schema is stale** — `001_schema.sql` lacks columns the app later added (e.g. `users.pending_approval`, `ticket_number`, `must_change_password`). Treat the live DB (pg_dump) as source of truth, not the seed files.
- **API has no hot-reload** — plain `ts-node`; any backend change needs a manual restart, and a type error anywhere blocks startup. Keep `tsc --noEmit` clean.
- **Resigned staff still listed** — `staff.findAll` hides only `terminated`, not `resigned`.
- **`packages/shared` exports gotcha** — `exports.require` points to `dist/index.cjs` which tsup doesn't emit (harmless in dev, would break a prod `nest build`).
- **Response shape** — hand-returned `{ data: T }`, no global interceptor (matches existing convention, not the idealized briefing).
- **Per-staff move has no "return to rotation"** un-pin affordance yet (a move is permanent).
- **Forecasting Phase 2** (Prophet/XGBoost) is stubbed only.

---

## 6. How to run

Database is hosted on **Supabase** (project `ypgkyytgpszlfhosolec`), connected via the
session-mode Supavisor pooler. Redis is still required for Bull queues (host it on
Render Key Value / Upstash, or run a local Redis for dev).

```powershell
# Set DB_* (Supabase session pooler) + REDIS_* in .env, then:
pnpm dev                 # API :4000, web :3000  (ML :8000 optional)
```

- `.env` DB block points at the Supabase session pooler (`DB_SSL=true`,
  `DB_USER=postgres.<project-ref>`); a commented LOCAL fallback block remains for offline dev.
- Admin login: `admin@workforceiq.app` / `P@$$w0rd` (super_admin).
- HR admin login (typed on web): `bookendshr.admin.com` / `hradmin123`.
- Read the real DB password from `.env` (git-ignored).

---

## 7. Conventions to follow (ground truth)

- Match the existing codebase, not the "BookendsShiftly" briefing: raw SQL, legacy Bull, `{ data }` responses, hard delete.
- Keep the **WorkforceIQ** name for now (rebrand is a future dedicated task).
- Schema changes = new numbered `assets/db/00N_*.sql` (+ a rollback file).
- New web UI must use **semantic tokens** (`bg-card`, `text-foreground`, `border-border`…) — never hardcoded gray/white, or dark mode breaks.
- Roles use `ROLES.*` constants; `ADMIN_ROLES` / `isAdminRole()` for admin-peer gating.

---

*This file is a living summary. When you complete meaningful work, add a row to §4 and update §5 gaps.*
