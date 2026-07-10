# WorkforceIQ — Project Status & Work Report

> AI-Powered Restaurant Workforce & Operations Planning System
> Maintained status document. Last updated: **2026-07-07**.
> Snapshot: server-side outlet scoping + automatic role-based notifications + installable PWA, plus employee self-service (My Day, mobile tabs, magic-link week), kiosk clock-in, i18n (en/gu/hi), real SendGrid email, and repo-wide lint/hot-reload DX — Tasks 0–11 on branch `perf/login-latency`. **Plus (2026-07-09) capacity planning, staff-documents vault, and a Phase-1 demand forecast** — see §4/§5/§8-H. **Pending manual DB migrations: `013`–`018` (see §5 & §8). `012_notifications` was applied to prod on 2026-07-07.**

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
`auth`, `staff`, `staff-documents`, `outlet`, `capacity`, `department`, `scheduling`, `attendance`, `leave`, `forecasting`, `allocation`, `notification`, `dashboard`, `roles`, `me`, `kiosk`, `public`, `health`

**Web pages** (`apps/web/src/app/(dashboard)/`):
`dashboard`, `staff`, `outlets`, `scheduling`, `attendance`, `leave`, `allocation`, `reports`, `accounts`, `approvals`, `account-types`, `settings/staffing-ratios`, `planning/new-outlet`, `planning/pax-import`

**DB migrations** (`assets/db/`, numbered, most with `_ROLLBACK`):
`001_schema` → `018_tenant_settings` (+ seed + real-staff data)

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
| 30 | _(Task 10)_ | Real email provider — `EmailProvider` now sends via the SendGrid v3 HTTPS API when `EMAIL_PROVIDER=sendgrid` (`SENDGRID_API_KEY` + verified `EMAIL_FROM`), plain-text + escaped-HTML parts; still defaults to `mock` (logs only). Never throws — a misconfig/failure returns `success:false` so the dispatch worker degrades to in-app, exactly like WhatsApp. Sits behind the existing Bull dispatch worker (WhatsApp → email → in-app fallback) with no worker changes |
| 31 | _(Task 11)_ | DX — repo-wide **ESLint flat config** (root `eslint.config.mjs` + `eslint.base.mjs`, per-package configs for api/shared/web with the Next + react-hooks plugins), run via a tiny cross-platform `scripts/eslint.mjs` that loads ESLint's **flat** engine (`loadESLint({useFlatConfig})`) on 8.57 without `cross-env`; lenient first pass (legacy → warnings) so `pnpm lint` is green across all workspaces via the existing Turbo pipeline. API `dev` stays on the reliable **ts-node** runner (an opt-in `dev:watch` = `nest start --watch` exists but can crash with `Cannot find module dist/main` on Node 24/Windows due to `incremental`+`deleteOutDir` — see §5) |
| 32 | _(review)_ | Adversarial multi-agent review of the whole Tasks 0–11 changeset (5 dimensions × per-finding verification) → **8 confirmed defects fixed**: kiosk attendance bucketed by UTC not local date (`toLocalDateStr`, HIGH), kiosk double clock-in → `UNIQUE(staff_id,date)` 500 (any-record guard), kiosk PIN brute-force (per-device/employee lockout), sign-out didn't clear the in-memory React Query cache (`AuthCacheReset`) or the SW `/api` cache (logout postMessage → SW purge), and the Task 11 lint runner used ESLint's *legacy* engine (a silent no-op — now the real flat engine) with an over-broad `**/public/**` ignore that hid the API `PublicModule`. 3 findings verified as false-positives and dropped |
| 33 | _(Capacity 1)_ | **Staff documents** — migration `016` reconciles the empty `staff_documents` scaffold into an in-DB base64 vault (**Aadhaar masked to last-4 server-side**; content never in list SQL); new `staff:documents` perm (admin/hr); module: list-meta / on-demand content / 2 MB upload (413 beyond, mime-checked) / delete, tenant + outlet-scoped, **owner-or-permission reads**; Documents card on `/staff/[id]` + read-only `/profile` (`/me/documents`); aspect-preserving doc downscale util |
| 34 | _(Capacity 2)_ | **Outlet capacity + ratios** — migration `017`: `outlets.total_tables/max_pax`, `post_category_map` (seeded from the **13 real positions**), per-category `staffing_ratios`, 6 dine-in outlets seeded by code (guarded); `PUT /outlets/:id/capacity` (`outlet:write`+scope); `GET/PUT /settings/staffing-ratios` (`allocation:read`/`roles:manage`); Capacity card on the outlet page + `/settings/staffing-ratios` page |
| 35 | _(Capacity 3)_ | **Capacity analysis** — `GET /outlets/capacity-analysis` (`allocation:read`, scoped): required vs actual vs variance per dine-in outlet + `totals`/`supportUnits`/`activeStaffTotal`. Verified against live data (**248 active / 173 dine-in / 75 support**, per-outlet exact) |
| 36 | _(Capacity 4)_ | **Dashboard "Capacity & Staffing"** — 3 stat cards (active / required / surplus-shortage) + per-outlet table + **dynamically-imported** Recharts chart (recharts stays out of employee-route chunks) |
| 37 | _(Capacity 5)_ | **New-outlet planner** — `POST /planning/staffing-projection` (`allocation:read`): pax or tables→pax @5.3/table, per-category required, comparable outlets (±20% pax), Expansion-pool coverage; `/planning/new-outlet` page. Math verified: 100 pax → 35 staff |
| 38 | _(Capacity 6)_ | **Pax history import** — reuses `pax_data` (daily rows @ noon key); `POST /pax-history/import` (`outlet:write`, per-row scoped upsert, imported/updated via `xmax`) + `GET /pax-history` (`forecast:read`); `/planning/pax-import` screen — CSV native + `.xlsx` via SheetJS (dynamically imported), **revenue→covers converter**, validated preview, result summary |
| 39 | _(Capacity 7)_ | **Phase-1 forecast + rebalancing** — migration `018` (`tenant_settings`, `covers_per_on_duty_staff`=10); `GET /forecasting/staffing-suggestions` (day-of-week recency-weighted 4/3/2/1, suggest vs **rostered** via scheduling coverage, `forecast:read`); `GET /outlets/rebalancing-suggestions` (advisory greedy pairing); dashboard rebalancing card + scheduling forecast strip. Pure TS/SQL — no ML |
| 40 | _(review)_ | Adversarial review of the capacity/documents backend → **1 confirmed fix**: `staff-documents` scope-bypass on NULL-`current_outlet_id` staff (a scoped `staff:documents` holder could reach unassigned staff) — now fails closed (404), matching `assertStaffInScope` |
| 41 | _(WI Phase 0)_ | **Workforce-Intelligence extension — Phase 0 discovery + `docs/PLAN.md`** (approved). 6-agent codebase map; extend-vs-build gap analysis for documents/staffing-engine/dashboard/predictor/transfers; additive migrations `019`+; 10 open questions resolved (Supabase Storage, roles→existing, allocation untouched, soft-delete new-tables-only). |
| 42 | _(WI Phase 1)_ | **Employee Documents module (F1)** — migration `019` (`document_types` lookup, `staff_documents` extended w/ status/version/encryption/audit cols + soft-delete, `staff_document_versions`, immutable `document_access_logs`, `documents:reveal`/`documents:status` perms). API: AES-256-GCM crypto, Supabase Storage (encrypted-in-DB fallback), magic-byte validation, versioning/replace, signed download URLs, permissioned+audited reveal, expiring/missing/widgets, doc-types CRUD, daily IST expiry `@Cron`. Web: embedded PDF/image preview, reveal, version drawer, `/documents` compliance page, `/settings/document-types`, dashboard widget. 27 new unit tests (magic-byte spoof, status edges, AES round-trip, signed-token). See `docs/PHASE-1-DOCUMENTS.md`. **Migration 019 pending (apply after 013–018).** |
| 43 | _(WI Phase 2)_ | **Restaurant Configuration & Staffing Ratios (F2)** — migration `020` (`restaurant_categories` (7 seeded), `restaurant_configurations` 1:1 outlet, per-**role** `staff_requirement_configurations` + immutable change-history, `ratio_templates`, `staffing:ratios` perm for admin/hr/head_of_house). API `modules/restaurant-config`: config GET/PUT, per-role ratios GET/PUT (writes history via pure `diffRatios`), history, categories, templates, apply-template (falls back to company category defaults). Web: `RestaurantConfigCard` on `/outlets/[id]` (config + ratios editor + history drawer + prefill), `/settings/ratio-templates`. 5 new tests (34 total). See `docs/PHASE-2-CONFIG-RATIOS.md`. **Migration 020 pending (apply after 019).** |
| 44 | _(WI Phase 3)_ | **Real-Time Staffing Engine + Company Dashboard (F3, F4)** — migration `021` (`staffing_snapshots` + seeds `t_excess`/`t_minor`). **Pure deterministic engine** (`staffing-engine.ts`): required/available/shortage/excess/vacant + 4-colour status + UNCONFIGURED (no ÷0), 13 Gauntlet tests. `StaffingService`: ~11 **batched** queries (no N+1), **3-tier ratio resolve** (outlet×role → category template → company default), roster/attendance/leave/transfer-aware. Endpoints `GET /staffing/requirements[/:outletId[/trend]]`, `GET /dashboard/company-staffing` (16 KPIs), gated `allocation:read`. Daily snapshot `@Cron` 01:30 IST. Web `/staffing`: KPI grid + lazy Recharts + restaurant cards (4-colour) + per-role drill-down. 13 new tests (47 total). See `docs/PHASE-3-STAFFING-ENGINE.md`. **Migration 021 pending (apply after 020).** |
| 45 | _(WI Phase 4)_ | **Staff Predictor (F5) + Transfer Recommendations (F6)** — migration `022` (`role_salary_configs`, `staff_predictions`, `transfer_recommendations` + `predictions:run` perm). F5: pure `PredictionStrategy`/`RatioBasedStrategy` (category-template→company-default ratios + salaries → headcount/payroll/cost-per-pax/productivity), persisted runs; `POST/GET /predictions`, `GET/PUT /settings/role-salaries` (Admin/HR); web `/predictions` + `/settings/role-salaries`. F6: pure greedy matcher (donor stays GREEN) + pluggable scorer chain, consumes the staffing engine, **persisted** recs w/ idempotent regen + status lifecycle; `GET/POST /transfer-recommendations[/regenerate]`, `…/:id/accept|reject` (accept **deep-links into existing /allocation**, not duplicated); web `TransferRecommendationsCard` on `/staffing`. 12 new tests (58 total). See `docs/PHASE-4-PREDICTOR-TRANSFERS.md`. **Migration 022 pending (apply after 021).** |
| 46 | _(WI Phase 5)_ | **Perf pass + seed data + docs (F9–F11)** — migration `023` seeds `restaurant_configurations` (6 outlets, category by brand, capacities from max_pax) + `role_salary_configs` (₹ averages by staff-category) so the dashboard + predictor light up on real data, and adds composite indexes for the engine's grouped reads (`staff(current_outlet_id,position_id) WHERE active`, attendance/leave/transfer). Consolidated `docs/WORKFORCE-INTELLIGENCE.md` (overview + go-live runbook) + README bullets + PLAN marked complete. **Whole F1–F11 brief implemented; all DoD gates green (tsc/lint/58 tests/build). Migrations 019–023 written+rollbacks, NONE applied; nothing committed (branch perf/login-latency).** |

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

**Capacity planning, staff documents & Phase-1 demand forecast (2026-07-09)**
- **Staff documents** — per-staff document vault (Aadhaar/PAN/passbook/contract…); admin/hr upload/view/delete (`staff:documents`), employees see their own read-only. Aadhaar persisted **masked to last-4** (DPDP); file bytes are base64 in the DB and **never in list responses**. Migration `016`.
- **Outlet capacity model** — tables + max pax per dine-in outlet; per-category `staffing_ratios` + `post_category_map` (built from the real 13 positions); `required = max(min_staff, ⌈max_pax ÷ pax_per_staff⌉)`. `GET /outlets/capacity-analysis` (required vs actual vs variance, scoped) drives the dashboard **Capacity & Staffing** section (stat cards + per-outlet table + lazy Recharts chart). Migration `017`.
- **New-outlet planner** — `/planning/new-outlet` projects per-category staff for a planned pax/tables, with comparable outlets and Expansion-pool coverage.
- **Pax import + Phase-1 forecast** — import daily covers (`/planning/pax-import`; CSV/xlsx; revenue→covers converter) into `pax_data`; `GET /forecasting/staffing-suggestions` returns a day-of-week recency-weighted forecast with suggested vs rostered staff; advisory cross-outlet rebalancing card on the dashboard. Everything is **advisory** — no auto-transfers, no auto-roster changes, no notifications, **no ML** (Phase-1 = pure TS/SQL). Migration `018`.

---

## 5. Known gaps / open items

- **RBAC data-scoping — server-side outlet scoping now enforced** (Task 0) across staff/attendance/leave/scheduling via `common/auth/outlet-scope.ts`: super_admin/admin/hr → all tenant outlets; head_of_house/chef/employee → their own outlet(s); an out-of-scope client `outletId` is rejected (403) and unscoped list reads are filtered to the caller's outlets. Also closed several cross-tenant leaks (endpoints that previously had no `tenant_id` filter). Residual: scheduling uses controller-level outlet guards rather than a deep per-query tenant rewrite (safe while single-tenant); no department scoping (`users` has no `department_id`).
- **Employee outlet assignment (Task 1 — done)** — migration `014` backfills `users.outlet_ids` from each account's linked staff row (`staff.user_id`); approval derives it automatically; a Staff Accounts outlet multi-select (accounts:manage, tenant-validated) sets it manually. `outletIds` is now resolved **live** (cached, busted on write) for non-admin roles, so a reassignment applies without re-login. **Apply `014_backfill_employee_outlets.sql` by hand** for existing accounts. Residual: no department scoping (`users` has no `department_id`).
- **Migrations are manual** — `pnpm db:migrate` has no runner script on disk; apply each new numbered file by hand (psql), in order. **Pending: `013_force_password_reset.sql`** (Task 0), **`014_backfill_employee_outlets.sql`** (Task 1), **`015_kiosk_clock_in.sql`** (Task 9 — kiosk devices + staff PIN + attendance source; note `015` adds an enum value OUTSIDE its `BEGIN/COMMIT`, so run the whole file, not just the transaction block). `012_notifications.sql` was applied to prod on 2026-07-07.
- **Credential hygiene done (Task 0)** — the three seeded passwords (`admin`, `HR`, staff default) are treated as **burned**: scrubbed from all docs/migrations, change-password now enforces ≥10 chars + letter + digit + a SHA-256 burned-password denylist, and migration `013` force-resets every non-super_admin account still on a seed password. **Manual: rotate super_admin + HR + all leaked secrets, and purge `.env`/credential CSVs from git history (BFG) — see §Manual Steps.** Until then the `/notifications` endpoints 500 and the bell degrades to 0/empty. The migration DROPs the unused legacy staff-keyed `notification_preferences` (rollback restores it).
- **Notification delivery caveats** — WhatsApp is mock unless `ENABLE_WHATSAPP=true` + Meta creds. Email is real via **SendGrid** (Task 10) when `EMAIL_PROVIDER=sendgrid` + `SENDGRID_API_KEY` + a verified `EMAIL_FROM`; otherwise it defaults to `mock` (logs only), so admins/hr (usually no staff row) get in-app only until SendGrid is configured. SES is still unimplemented. ~115 active staff have no login → external-channel notifications only (no in-app row). Web Push intentionally not built.
- **Kiosk clock-in setup (Task 9)** — after applying `015`, a manager enrolls a tablet from **Outlets → open an outlet → Kiosk devices → Enroll device**, then opens the one-time enrollment link on the tablet (the raw device token is shown once and stored only as a SHA-256 hash). Each staff member needs a PIN set from their **Staff → profile → Kiosk PIN** card before they can punch. Kiosk punches are stamped `source='kiosk'`; a lost tablet is killed via **Revoke**. No env vars required.
- **i18n translations need human review (Task 8)** — `next-intl` v4 is wired cookie-first (`wfiq-locale`, no URL routing); English is authoritative. The Gujarati (`gu.json`) and Hindi (`hi.json`) catalogs are **machine-drafted** and each carry a `_note` TODO — have a native speaker review before relying on them. Only employee-facing strings (My Day, bottom tabs, login, profile) are keyed so far; the rest of the app stays English until more strings are extracted.
- **`pnpm lint` now works repo-wide (Task 11)** — flat ESLint config at the root + per package, run through `scripts/eslint.mjs` (which enables flat mode on ESLint 8.57). The first pass is deliberately lenient: legacy patterns are **warnings**, so `pnpm lint` exits 0 while surfacing issues to tighten over time. `pnpm typecheck` + `pnpm build` remain the hard gates.
- **Seed schema is stale** — `001_schema.sql` lacks columns the app later added (e.g. `users.pending_approval`, `ticket_number`, `must_change_password`). Treat the live DB (pg_dump) as source of truth, not the seed files.
- **API dev runner** — `pnpm dev` uses **ts-node** (runs straight from source; reliable). An opt-in `pnpm --filter @workforceiq/api dev:watch` (`nest start --watch`) gives hot-reload BUT can crash on Node 24/Windows with `Cannot find module '…/dist/main'`: `nest build` uses `incremental` + `deleteOutDir`, so a stale/racing `*.tsbuildinfo` makes tsc emit nothing while nest still tries to run `dist/main`. That regression is why `dev` was reverted to ts-node (it was briefly `nest start --watch` in Task 11). A type error still blocks startup, so keep `tsc --noEmit` clean; `nest build` for prod is fine (delete `*.tsbuildinfo` first if it no-ops).
- **`packages/shared` exports gotcha** — `exports.require` points to `dist/index.cjs` which tsup doesn't emit (harmless in dev, would break a prod `nest build`).
- **Response shape** — hand-returned `{ data: T }`, no global interceptor (matches existing convention, not the idealized briefing).
- **Forecasting Phase 2** (Prophet/XGBoost) is stubbed only.
- **Capacity/documents/forecast migrations pending (`016`–`018`)** — apply in order **after** `013`–`015` (see §8-H). Until applied, the capacity/ratios/forecast endpoints error and their UI shows a neutral "not set up yet" state.
- **Capacity ratios are heuristics, not labour-law compliance** — the seeded defaults reproduce today's group averages. This group has **no Bar/Barista position** and its **Support (ODC) staff sit in a separate unit**, so the default Bar + Support ratios manufacture a phantom dine-in shortage — zero them on the Staffing-ratios page. Position tags are rough (e.g. 42 staff tagged "Outlet Manager"), which blurs per-category variance until posts are corrected.
- **Pax forecast is Phase-1 only** — day-of-week recency-weighted average of imported covers (no ML); stays dark until ~2 months of covers are imported. ⚠️ The owner's restaurant reports are **revenue (₹), not covers** — use the import screen's revenue→covers converter (Net Sales ÷ avg spend/cover) or supply real cover counts.
- **Aadhaar stored masked-only by design** — only the last-4 (`XXXX-XXXX-1234`) + the scan are persisted; full Aadhaar numbers are out of scope (a separate DPDP/KYC decision).
- **No Expansion pool** — the planner's Expansion-pool coverage reads 0 until an outlet named "Expansion" (a new-openings bench) exists.
- **`xlsx` (SheetJS) added to `apps/web`** — used only by the pax-import screen and **dynamically imported**, so it never lands in other route chunks.

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

## 8. Manual steps to go live (Tasks 0–11)

Everything below is a human/ops action the code can't do for itself. Do them in order.

**A. Database migrations — apply by hand, in order (psql, no runner script).**
- [ ] `013_force_password_reset.sql` — adds `users.password_updated_at`, flags every non-super_admin still on a seed password with `must_change_password=TRUE`. (Drops the legacy staff-keyed `notification_preferences` table.)
- [ ] `014_backfill_employee_outlets.sql` — backfills `users.outlet_ids` from each account's linked `staff.current_outlet_id`.
- [ ] `015_kiosk_clock_in.sql` — `kiosk_devices`, `staff.kiosk_pin_hash`, `attendance_records.source`, and the `'kiosk'` clock method. **Run the whole file**, not just the `BEGIN/COMMIT` block — the `ALTER TYPE ... ADD VALUE 'kiosk'` sits *outside* the transaction on purpose (Postgres can't use a new enum value in the same txn).
- (`012_notifications.sql` was already applied to prod on 2026-07-07. Each migration has a matching `_ROLLBACK.sql`.)

**B. Secrets & credential hygiene (Task 0).**
- [ ] Rotate the three **burned** seed passwords: super_admin, HR admin, and the staff default. (Change-password already enforces ≥10 chars + letter + digit + a burned-password denylist; migration `013` forces the reset for staff.)
- [ ] Rotate any other secrets that ever touched git, and purge `.env*` / the old credential CSV from git **history** with BFG or `git filter-repo` (removing them from the tip is not enough).
- [ ] Confirm `.env` is present on each environment (DB + Redis creds) — it's git-ignored; read the real DB password from it.

**C. Email delivery (Task 10) — optional but recommended.**
- [ ] To send real email set `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY=…`, and `EMAIL_FROM=` a **SendGrid-verified** single sender or domain (optionally `EMAIL_FROM_NAME`). Left unset it stays `mock` (logs only) and admins/hr get in-app only.

**D. Magic-link staff weeks (Task 5) — optional.**
- [ ] Set `MAGIC_LINK_SECRET=` (a long random string) to enable the WhatsApp/`/w/[token]` read-only week for login-less staff. Optionally `MAGIC_LINK_ALL_STAFF=true` to send the link to everyone, not just login-less staff.

**E. Kiosk clock-in (Task 9).**
- [ ] After migration `015`, enroll a tablet per outlet: **Outlets → open an outlet → Kiosk devices → Enroll device**, then open the one-time enrollment link on that tablet (the raw token is shown once, stored only as a SHA-256 hash).
- [ ] Set each staff member's PIN: **Staff → open the profile → Kiosk PIN** (4–6 digits). No env vars needed. Revoke a lost tablet from the same outlet panel.

**F. Internationalization (Task 8).**
- [ ] Have a native speaker review the **machine-drafted** Gujarati (`apps/web/messages/gu.json`) and Hindi (`hi.json`) catalogs before relying on them — each carries a `_note` TODO. English is authoritative.

**G. Dev environment.**
- [ ] Use **Node 20** (`.nvmrc`; Next 14.2 dev breaks on Node ≥ 23). `pnpm dev` runs the API via ts-node (reliable); `pnpm lint` / `pnpm typecheck` / `pnpm build` are green.
- [ ] If `pnpm dev` seems broken, first check for **zombie dev servers** holding ports 3000/4000 (`Get-NetTCPConnection -LocalPort 3000,4000 -State Listen`), kill stray `node` processes, then `pnpm clean` and re-run — a server left running from before a `next.config`/dependency change serves the old config against new code.
- [ ] After pulling changes to `next.config.mjs` or new dependencies (e.g. next-intl), **fully restart `pnpm dev`** — Next does not hot-reload config or newly-installed packages. If you hit `Cannot find module './xxx.js'` / fallback-chunk 500s (a Node-24 webpack-cache artifact), run **`pnpm clean`** (wipes `.next` + build caches) and restart.

**H. Capacity planning, staff documents & demand forecast (2026-07-09).**
- [ ] Apply migrations `016_staff_documents` → `017_outlet_capacity` → `018_tenant_settings`, in order, **after** `013`–`015`. Each ships a `_ROLLBACK.sql`. `016` DROP+recreates the empty `staff_documents` scaffold into the base64 vault; `017` seeds ratios + the 6 dine-in outlets' capacity by code (guarded on `max_pax IS NULL`); `018` seeds `covers_per_on_duty_staff=10`.
- [ ] Before `017`, confirm the outlet name↔code mappings: **Capiche Uni = `CAP-UNI`**, **Aiko "Pal"/Surat = `AIK-SUR`**, **Aiko "Ambli"/Ahmedabad = `AIK-AHM`** (plus Piplod/Vesu/Ambli). There is **no Expansion-pool outlet** today, so the planner's coverage reads 0 until one is created.
- [ ] Import ~2 months of daily covers via **Settings → Import pax history** (columns `Date | Outlet | Pax`, outlet names matching the DB). The owner's May/June reports are **revenue, not covers** — tick "derive covers from revenue" and enter an average spend/cover, or supply real cover counts. (Or hand the raw sheet to Claude to reshape into `Date | Outlet | Pax` first.)
- [ ] After a week of real data, review the seeded ratios on **Staffing ratios** — in particular **zero out Bar and Support for dine-in** — and tune **covers per on-duty staff** (default 10).
- [ ] Decide whether the rough position tags (42 "Outlet Manager", etc.) should be corrected to real posts — until then per-category variance is blurred.
- [ ] Aadhaar policy: the system stores **masked last-4 + scan only** by design. If full numbers are ever required (payroll/KYC), treat that as a separate, deliberate compliance decision — do not widen the schema casually.

**I. Workforce-Intelligence extension — Phase 1 (Employee Documents, 2026-07-09).**
- [ ] Apply **`019_documents_domain.sql`** (after `013`–`018`). Ships a `_ROLLBACK`. Additive: extends `staff_documents`, adds `document_types` / `staff_document_versions` / `document_access_logs`, seeds `documents:reveal` + `documents:status` perms.
- [ ] Set **`DOCUMENT_ENCRYPTION_KEY`** (32 bytes hex/base64) in `.env` — without it, document bytes/numbers are stored **UNENCRYPTED** (dev only). Optionally `DOCUMENT_SIGN_SECRET`.
- [ ] Create a **private Supabase Storage bucket** `staff-documents`; set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (+ optional `SUPABASE_DOCUMENTS_BUCKET`). Unset → encrypted-in-DB fallback (fine for dev).
- [ ] Note: Aadhaar full number is now stored **encrypted + reveal-gated** (reverses the earlier masked-only stance) — audited via `document_access_logs`. See `docs/PHASE-1-DOCUMENTS.md`.
- [ ] **Phase 2** — apply **`020_restaurant_config_ratios.sql`** (after 019). `staffing:ratios` seeded for admin/hr/head_of_house. Then per outlet: set the category + capacities and per-role ratios (or Prefill from a category template) on the outlet page. Ratio templates managed at `/settings/ratio-templates`. See `docs/PHASE-2-CONFIG-RATIOS.md`.
- [ ] **Phase 3** — apply **`021_staffing_snapshots.sql`** (after 020; seeds `t_excess`/`t_minor`). The `/staffing` company dashboard + per-outlet cards then compute live; outlets show ⚪ *Not set up* until capacity + ratios are set (Phase 2). The daily snapshot cron (01:30 IST) populates trend charts over subsequent days. See `docs/PHASE-3-STAFFING-ENGINE.md`.
- [ ] **Phase 4** — apply **`022_predictor_transfers.sql`** (after 021; seeds `predictions:run`). Enter role averages at `/settings/role-salaries` (Admin/HR) so the `/predictions` predictor shows payroll. Generate transfer recommendations on `/staffing` (Regenerate); Accept deep-links into `/allocation` to complete the move. See `docs/PHASE-4-PREDICTOR-TRANSFERS.md`.

---

*This file is a living summary. When you complete meaningful work, add a row to §4 and update §5 gaps.*
