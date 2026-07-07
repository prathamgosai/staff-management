# WorkforceIQ — Project Status & Work Report

> AI-Powered Restaurant Workforce & Operations Planning System
> Maintained status document. Last updated: **2026-07-07**.
> Snapshot: server-side outlet scoping + automatic role-based notifications + installable PWA shipped on branch `perf/login-latency` (Tasks 0–7). **Migration `012_notifications` must be applied manually before the notification features work at runtime.**

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
| 11 | `c1471e3` | Server-side outlet scoping across staff/attendance/leave/scheduling (Task 0) |
| 12 | `ff7f6ab` | Shared notification event contracts — `NotificationEvent`, per-event payloads, channel (Task 1) |
| 13 | `42040ee` | Migration `012` — `notifications`, user-centric `notification_preferences`, `roster_publications` (Task 2) |
| 14 | `ac590cb` | Notification module — `emit()` recipient matrix, dispatch worker (WhatsApp→email→in-app), in-app centre, leave/registration emit points (Task 3) |
| 15 | `cc38bd1` | Roster draft→publish (+`schedule:publish` gate) + `SHIFT_CHANGED` on published-week edits + web Publish button/badge (Task 4) |
| 16 | `609b6f5` | In-app notification bell (unread badge, dropdown, mark-read) + `/notifications` history page (Task 5) |
| 17 | `d75e7a0` | PWA — app-shell/navigation caching, network-first API cache, dismissible install hint (Task 6) |
| 18 | `d6e9627` | Nightly `SHIFT_REMINDER` Bull repeatable (idempotent) + `/settings/notifications` preferences (Task 7) |
| 19 | `56b75e5`… | Session hotfixes (deployed to prod): Employee-ID login, DB connect-retry, permission cache + client refetch tuning, static PWA manifest, Node-20 pin |
| 20 | _(Task 0)_ | Credential hygiene — scrubbed the three burned passwords repo-wide, strengthened change-password policy (≥10 + letter/digit + burned-password denylist), migration `013` forced reset, removed the credential CSV + hardened `.gitignore` |
| 21 | _(Task 1)_ | Employee outlet self-scoping — migration `014` backfills `outlet_ids` from the linked staff row, live outlet resolution (no re-login), derive-on-approval, Staff Accounts outlet multi-select (accounts:manage, tenant-validated) |
| 22 | _(Task 2)_ | Employee "My Day" (`/home`) — role-based landing (employee/chef → `/home`), next-shift / this-week / leave cards, scoped `GET /scheduling/my-week` (published weeks only) |
| 23 | _(Task 3)_ | Mobile nav — bottom tab bar (Home/Roster/Attendance/Leave/Profile, safe-area, ≥44px) below md + day-first roster (today default, day chips, swipe); desktop table unchanged; new `/profile` page |
| 24 | _(Task 4)_ | Cold-start resilience — persist key read queries to localStorage (versioned buster, cleared on logout), "Waking the server…" banner on >4s fetches, SW cache `v3`; page loads already use skeletons |
| 25 | _(Task 5)_ | Magic-link "My Week" — HS256 token (dedicated `MAGIC_LINK_SECRET`), `GET /public/my-week/:token` (no auth, 20/min/IP, uniform 404, staff+tenant from the signed token only), `/w/[token]` read-only page (noindex), ROSTER_PUBLISHED WhatsApp link for login-less staff (degrades to the existing template) |
| 26 | _(Task 6)_ | Print-ready roster (A4 portrait, black-on-white `@media print`) + default staff list hides resigned as well as terminated (explicit status still shows them) + return-to-rotation un-pin (`DELETE /scheduling/overrides/:staffId`, `schedule:write`, outlet-scoped) |
| 27 | _(Task 7)_ | Avatar & bundle perf — base64 avatar dropped from the staff-list SQL (list falls back to initials; big response-size cut), client resize to 200×200 WebP (JPEG fallback, q0.8) + ~150 KB server cap, lazy-loaded avatar imgs; recharts/fullcalendar/dnd-kit confirmed unimported (no chart/calendar chunks on employee routes) |
| 28 | _(Task 8)_ | i18n scaffold — `next-intl` v4 cookie-based (no URL routing, `wfiq-locale`), English / Gujarati / Hindi catalogs (`apps/web/messages/{en,gu,hi}.json`, gu+hi machine-drafted → flagged for human review), `NextIntlClientProvider` at the root layout, `/profile` language switcher, employee-facing surfaces localised (My Day, bottom tabs, login) |
| 29 | _(Task 9)_ | Kiosk clock-in mode — migration `015` (`kiosk_devices`, `staff.kiosk_pin_hash`, `attendance_records.source`, `'kiosk'` clock method); device-token auth (`x-kiosk-token`, SHA-256 stored, shown once) via `KioskDeviceGuard`; per-staff bcrypt PIN; login-less `/kiosk` keypad screen (Employee ID + PIN → clock-in/out, `source='kiosk'`, outlet-scoped, throttled 30/min); manager UI to enroll/revoke devices (outlet page) + set PINs (staff page), gated by `attendance:write` |

### Feature areas delivered

**Employee directory & data (real data loaded)**
- ~371 active staff imported from `Employee Directory _1.xlsx`; post/section matched by name against `Restaurant Staffing.xlsx`.
- Live-DB contact backfill (3 passes): real Employee Codes, phones (239/260), emails (207), migrations `004`–`006` (+ rollbacks + audit CSV).
- Staff logins switched to real emails where unique (204/256), seeded default password (now **burned** — forced reset in migration `013`; see credential manager), migration `007`.
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

**Automatic role-based notifications (2026-07-06)**
- Server-side outlet scoping (Task 0): staff/attendance/leave/scheduling derive allowed outlets from the caller (`common/auth/outlet-scope.ts`); out-of-scope `outletId` → 403; unscoped list reads filtered to the caller's outlets. Also closed cross-tenant leaks.
- `notificationService.emit(event, payload)` (Task 3): resolves recipients from the payload + server-side role/outlet scope (never a client id), writes one in-app `notifications` row per recipient, and enqueues one external-channel Bull job each. Recipient matrix implemented; `super_admin` only receives `SYSTEM_ALERT` + `ACCOUNT_PENDING_APPROVAL`.
- Bull `dispatch` worker: per-user prefs → WhatsApp template (Meta Graph API, only when `ENABLE_WHATSAPP=true` + phone) → email fallback → in-app only; records `channels_sent`; retry+backoff; `AggregateError` unwrapped (shared `formatError`).
- Emit points: leave create/decision, registration (`ACCOUNT_PENDING_APPROVAL`), roster publish (`ROSTER_PUBLISHED`), per-staff move + template retime on **published** weeks (`SHIFT_CHANGED`). Generation/regeneration never notifies.
- Roster draft→publish (Task 4): `roster_publications` + `@RequirePermission('schedule:publish')`; web Publish button + Draft/Published badge.
- In-app centre (Task 5): header bell (unread badge, 30s poll, mark-read, deep-links) + `/notifications` history page; own-data endpoints only.
- Nightly `SHIFT_REMINDER` (Task 7): Bull repeatable at 20:00 Asia/Kolkata, idempotent per (user, shift); `/settings/notifications` per-channel toggles.

**PWA (Task 6)** — service worker (cache `v2`) now caches the app shell/navigations and does network-first-with-fallback for `/api/*` GETs; a dismissible install hint captures `beforeinstallprompt` (Android/desktop) and shows Add-to-Home-Screen instructions on iOS. (Manifest + icons already shipped in `0063a1e`.)

---

## 5. Known gaps / open items

- **RBAC data-scoping — server-side outlet scoping now enforced** (Task 0) across staff/attendance/leave/scheduling via `common/auth/outlet-scope.ts`: super_admin/admin/hr → all tenant outlets; head_of_house/chef/employee → their own outlet(s); an out-of-scope client `outletId` is rejected (403) and unscoped list reads are filtered to the caller's outlets. Also closed several cross-tenant leaks (endpoints that previously had no `tenant_id` filter). Residual: scheduling uses controller-level outlet guards rather than a deep per-query tenant rewrite (safe while single-tenant); no department scoping (`users` has no `department_id`).
- **Employee outlet assignment (Task 1 — done)** — migration `014` backfills `users.outlet_ids` from each account's linked staff row (`staff.user_id`); approval derives it automatically; a Staff Accounts outlet multi-select (accounts:manage, tenant-validated) sets it manually. `outletIds` is now resolved **live** (cached, busted on write) for non-admin roles, so a reassignment applies without re-login. **Apply `014_backfill_employee_outlets.sql` by hand** for existing accounts. Residual: no department scoping (`users` has no `department_id`).
- **Migrations are manual** — `pnpm db:migrate` has no runner script on disk; apply each new numbered file by hand (psql), in order. **Pending: `013_force_password_reset.sql`** (Task 0), **`014_backfill_employee_outlets.sql`** (Task 1), **`015_kiosk_clock_in.sql`** (Task 9 — kiosk devices + staff PIN + attendance source; note `015` adds an enum value OUTSIDE its `BEGIN/COMMIT`, so run the whole file, not just the transaction block). `012_notifications.sql` was applied to prod on 2026-07-07.
- **Credential hygiene done (Task 0)** — the three seeded passwords (`admin`, `HR`, staff default) are treated as **burned**: scrubbed from all docs/migrations, change-password now enforces ≥10 chars + letter + digit + a SHA-256 burned-password denylist, and migration `013` force-resets every non-super_admin account still on a seed password. **Manual: rotate super_admin + HR + all leaked secrets, and purge `.env`/credential CSVs from git history (BFG) — see §Manual Steps.** Until then the `/notifications` endpoints 500 and the bell degrades to 0/empty. The migration DROPs the unused legacy staff-keyed `notification_preferences` (rollback restores it).
- **Notification delivery caveats** — WhatsApp is mock unless `ENABLE_WHATSAPP=true` + Meta creds; the email provider is still a mock (SES/SendGrid unimplemented), so admins/hr (usually no staff row) get in-app only until email is wired. ~115 active staff have no login → external-channel notifications only (no in-app row). Web Push (Task 8) intentionally not built.
- **Kiosk clock-in setup (Task 9)** — after applying `015`, a manager enrolls a tablet from **Outlets → open an outlet → Kiosk devices → Enroll device**, then opens the one-time enrollment link on the tablet (the raw device token is shown once and stored only as a SHA-256 hash). Each staff member needs a PIN set from their **Staff → profile → Kiosk PIN** card before they can punch. Kiosk punches are stamped `source='kiosk'`; a lost tablet is killed via **Revoke**. No env vars required.
- **i18n translations need human review (Task 8)** — `next-intl` v4 is wired cookie-first (`wfiq-locale`, no URL routing); English is authoritative. The Gujarati (`gu.json`) and Hindi (`hi.json`) catalogs are **machine-drafted** and each carry a `_note` TODO — have a native speaker review before relying on them. Only employee-facing strings (My Day, bottom tabs, login, profile) are keyed so far; the rest of the app stays English until more strings are extracted.
- **`pnpm lint` is unconfigured repo-wide** — no ESLint config exists in any package (pre-existing), so `pnpm lint` errors before running. `pnpm typecheck` + `pnpm build` are the working quality gates.
- **Seed schema is stale** — `001_schema.sql` lacks columns the app later added (e.g. `users.pending_approval`, `ticket_number`, `must_change_password`). Treat the live DB (pg_dump) as source of truth, not the seed files.
- **API has no hot-reload** — plain `ts-node`; any backend change needs a manual restart, and a type error anywhere blocks startup. Keep `tsc --noEmit` clean.
- **`packages/shared` exports gotcha** — `exports.require` points to `dist/index.cjs` which tsup doesn't emit (harmless in dev, would break a prod `nest build`).
- **Response shape** — hand-returned `{ data: T }`, no global interceptor (matches existing convention, not the idealized briefing).
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
- Admin login: `admin@workforceiq.app` (super_admin) — password in the credential manager, never committed.
- HR admin login (typed on web): `bookendshr.admin.com` — password in the credential manager, never committed.
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
