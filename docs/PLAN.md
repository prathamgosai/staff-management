# PLAN.md — Workforce Intelligence Extension (Documents · Staffing · Predictor · Transfers)

> **Phase 0 — Discovery & Plan. No code has been written.** This document ends at an
> **approval gate** (§14). Nothing in Phases 1–5 starts until you sign off and answer the
> Open Questions (§13).
>
> App under extension: **WorkforceIQ** (the brand you call *Bookend Shifty*). This is a
> live, brownfield NestJS + Next.js monorepo. **Prime directive honoured throughout: extend
> and integrate, never rewrite the existing modules.**
>
> Discovery method: 6 parallel read-only agents mapped the stack, full DB schema, the
> "do-not-touch" modules, the existing feature baselines, RBAC/API conventions, and the web
> component kit (≈642k tokens, 276 tool calls, 0 errors). Every claim below is grounded in
> current code, cited `file:line`.

---

## 0. TL;DR — the single most important finding

**~40% of this brief already exists in a first-pass form.** A prior 8-task build (commit
`747fcd9`, migrations `016`–`018`) already shipped: a staff-document vault, an outlet
capacity model with category-level ratios, a required-vs-actual capacity analysis, a
dashboard capacity section, a new-outlet planner, pax import, a Phase-1 forecast, and an
ephemeral rebalancing suggester. **So this is not a greenfield build — it is a
deepening/graft onto existing foundations.** The plan below is written as an
**extend-vs-build gap analysis**, not a from-scratch design. That is the highest-value
thing Phase 0 can tell you, and it changes the effort estimate dramatically (most of the
"hard" plumbing — modules, migrations pattern, RBAC, charts, upload utils — is already
there to reuse).

Second finding: **migrations `013`–`018` are written but NOT yet applied to the live
Supabase DB** (live is applied through `012`). Everything below sits on top of `016`–`018`,
so **applying `013`→`018` is a hard prerequisite** and new migrations start at **`019`**.

---

## 1. Architecture Summary

| Layer | Reality (verified) | Cite |
|---|---|---|
| **Monorepo** | pnpm 9 + Turborepo; `apps/*` + `packages/*`; Node pinned `>=20 <23` | `package.json:5-34`, `.nvmrc` |
| **API** | NestJS **10.4.22**, TypeScript, **raw `pg` Pool (NO ORM)**, parameterized SQL, port 4000 | `apps/api/package.json` |
| **Web** | Next.js **14.2.35** App Router, React 18.3, Tailwind, **TanStack Query v5**, Zustand, Radix UI (shadcn kit), **Recharts 2.15**, FullCalendar, dnd-kit, react-hook-form+zod, next-themes, **sonner** | `apps/web/package.json` |
| **Shared** | `packages/shared` — TS types, enums, **RBAC constants + `PERMISSION_CATALOG`**; dual ESM/CJS via tsup | `packages/shared/*` |
| **DB** | PostgreSQL (Supabase, Sydney/`ap-southeast-2`, ~470 ms RTT); **UUID PKs, `tenant_id` on most tables, HARD delete (no `deleted_at` anywhere)**, `set_updated_at()` trigger on 10 tables | `assets/db/001_schema.sql` |
| **Migrations** | Hand-numbered `NNN_name.sql` + `NNN_name_ROLLBACK.sql`, **applied by hand** (no runner on disk); live applied through `012`; `013`–`018` pending; next number **`019`** | `assets/db/` |
| **Jobs / Scheduler** | **`@nestjs/schedule` `ScheduleModule.forRoot()`** is wired; weekly roster uses `@Cron("5 0 * * 1", timeZone:"Asia/Kolkata")`. Legacy **Bull** (`notifications`, `auto-schedule`) also present but the Bull auto-schedule path is effectively dead | `app.module.ts:32`, `rotation.scheduler.ts:68` |
| **Events** | **`@nestjs/event-emitter` 2.1.1 installed** — ideal for the brief's cross-module domain events (`StaffingCalculated`, `DocumentExpired`) | `apps/api/package.json:22` |
| **Auth / RBAC** | JWT + refresh-token rotation; **DB-backed editable role→permission matrix** enforced live per-request in `JwtStrategy` (30 s cache); `@RequirePermission` + `PermissionsGuard`; `super_admin` = `"*"`; outlet-scope helpers for "own restaurant" | `jwt.strategy.ts`, `roles.service.ts`, `common/auth/outlet-scope.ts` |
| **Validation** | Global `ValidationPipe {whitelist, forbidNonWhitelisted, transform}` + **class-validator/class-transformer DTOs** (zod is web-only) | `main.ts:53-60` |
| **Response envelope** | Hand-returned **`{ data: T }`** (lists add `{ data, pagination }`); **no global interceptor**; default Nest `HttpException` error JSON | `staff.service.ts`, `roles.service.ts` |
| **Tests** | **Jest configured for `apps/api` only**, proven `DB_POOL`-mock pattern (1 spec: `auth.service.spec.ts`); **no web test harness** | `apps/api/jest.config.js` |
| **Theming** | next-themes `.dark` class + **semantic Tailwind tokens** in `globals.css` (`--card`, `--foreground`, `--chart-1..5`, `--success/warning/info/destructive`). **Rule: new UI must use tokens** | `globals.css`, `tailwind.config.ts` |

**Naming translation (brief → code).** The brief speaks "employee / restaurant /
role-designation"; the codebase says **`staff` / `outlet` / `position`**. New code will use
the codebase vocabulary. Brand stays **WorkforceIQ** (rebrand is a separate future task).

**Design principle for new modules (F11).** Each new area becomes a cohesive Nest module
behind a thin service; cross-module talk goes through **`@nestjs/event-emitter` domain
events** or explicit injected service interfaces — never deep cross-module imports. New
modules sit behind a **feature flag** (see §7 — reuse `tenant_settings`).

---

## 2. Existing Modules (the "do-not-touch" set) — what they give the new features

All are `JwtAuthGuard`-protected; scoping via `common/auth/outlet-scope.ts`
(`allowedOutletIds` → `null` for admin/hr/super_admin = all outlets).

| Module | Path | What the new work reads from it | Key cite |
|---|---|---|---|
| **Staff** (Employee Mgmt) | `modules/staff` | `staff` master; `findAll` list conventions (page/limit/search/status filters, `ORDER BY name` hard-coded); `current_outlet_id` = the "belongs-to outlet" truth; `employment_status` enum (`active/…/terminated/resigned`); `softDelete()` = status flip, **not** a `deleted_at` | `staff.service.ts:17-186` |
| **Scheduling** (Staff Shifts) | `modules/scheduling` | weekly roster (`schedules`→`schedule_shifts`→`shift_assignments`); `getTodayShifts`, `getCoverageSummary`; the `@Cron(...,"Asia/Kolkata")` daily-job pattern | `scheduling.service.ts` |
| **Attendance** | `modules/attendance` | **"present today"** = `attendance_records` where `date=D AND status IN ('present','late','early_departure')`; "in building now" = `clock_out IS NULL`; `UNIQUE(staff_id,date)` | `attendance.service.ts:142` |
| **Leave** | `modules/leave` | **"on leave today"** = `leave_requests` (`status='approved'`, `start_date<=D<=end_date`), outlet via `staff.current_outlet_id` (leave rows have no `outlet_id`) | `leave.service.ts:132` |
| **Allocation** (= **Inter-restaurant Transfer**) | `modules/allocation` | **F6's deep-link target.** `staff_transfers` table + `GET/POST /allocation/transfers`, `PUT /allocation/transfers/:id/review`; approving a transfer runs `UPDATE staff SET current_outlet_id=to_outlet` — the only writer of `current_outlet_id`; web page `/allocation` | `allocation.service.ts:45-61` |
| **Outlet** (Restaurant-wise Staffing) | `modules/outlet` | `outlets` master + `active_staff_count` per outlet; `PUT /outlets/:id/capacity` (`total_tables`,`max_pax`); `capacity-analysis` + `rebalancing-suggestions` live here | `outlet.service.ts:11-52` |
| **Department / Positions** | `modules/department` | `positions` = the tenant-wide **role/designation master** (13 real positions); `departments` are per-outlet | `department.service.ts` |
| **Roles / RBAC** | `modules/roles` | `role_permissions` matrix, `PERMISSION_CATALOG`, `PermissionsGuard`, Account Types page | `roles.service.ts` |

> **⚠️ Known gaps in the existing transfer flow (F6 must design around these, not "fix"
> them" unless you approve):** the `allocation` controller has **no `@Roles`/
> `@RequirePermission`, no outlet-scope, and no tenant check** — any authenticated user can
> list/create/approve any transfer. `effective_date` is **ignored** (approval flips outlet
> immediately). Temporary transfers **never auto-revert** and `'completed'` status is never
> set. `staff_transfers` has **no `tenant_id`**. F6 will produce *advisory* recommendations
> and deep-link a human into this flow; it will **not** auto-execute. Hardening the
> allocation module is called out as a **Risk** (§11) and an **Open Question** (§13.6), not
> assumed.

---

## 3. Database Overview — current schema + what's missing

**~31 tables, 20 enums.** Confirmed facts: UUID PKs; `tenant_id` on newer tables (some
older tables — `staff_transfers`, `leave_requests`, `attendance_records`,
`shift_assignments` — scope tenancy via a `staff`/`outlets` join instead); **no `deleted_at`
on any table**; `set_updated_at()` trigger on `tenants, brands, outlets, users, staff,
schedules, schedule_shifts, shift_assignments, attendance_records, staff_transfers`.

### 3a. The 9 brief tables — all MISSING, mapped to closest existing

| Brief table | Status | Closest existing (reuse/supersede) |
|---|---|---|
| `document_types` | **new** | encoded today as a `CHECK` on `staff_documents.doc_type` (9 values) — needs a real lookup table |
| `employee_documents` | **new name** | **`staff_documents`** (016) IS this — extend in place, keep the name |
| `employee_document_versions` | **new** | none — no versioning today (delete is a hard `DELETE`) |
| `document_access_logs` | **new** | generic `audit_logs` exists but is **never written** (0 writes) — build a dedicated immutable log |
| `restaurant_configurations` | **new** | fields split across `outlets` cols + `tenant_settings` KV; **cuisine/category, area sqft, kitchen size are genuinely absent** |
| `staff_requirement_configurations` | **new** | **`labor_ratio_configs`** (001, per-outlet×position, `pax_per_staff/min/max`) is a dead near-twin; category-level `staffing_ratios` (017) is live |
| `role_salary_configs` | **new** | none. Pay *columns* exist (`staff.base_salary`, `hourly_rate`, whole `payroll_records`) but **unseeded**; no role→salary master |
| `staff_predictions` | **new** | `demand_forecasts` is outlet-pax level, not staffing |
| `transfer_recommendations` | **new** | `staff_transfers` is a committed-transfer *ledger*, not a scored recommendation store |
| `staffing_snapshots` *(expanded brief)* | **new** | none — required to power trend charts (history can't be recomputed live) |

### 3b. Assets we can reuse instead of duplicating
- **`positions`** = the role master (13 real: Head Chef, Chef de Partie, Cook, Kitchen
  Helper, Kitchen Prep, R&D Chef, Service Crew, Sr Service Crew, Cashier, Part-Time,
  Outlet Manager, Assistant Manager, ODC). **No Bar/Barista position exists.**
- **`post_category_map`** (017) → Kitchen/Service/Management/Support/General category rollup.
- **`staffing_ratios`** (017) = category-level ratio defaults → becomes the **template layer**.
- **`labor_ratio_configs`** (001, unused) = per-outlet×role ratio shape — prior art for F2.
- **`tenant_settings`** (018, KV `NUMERIC`) = the settings layer for thresholds & flags.
- **`operating_hours` JSONB** on `outlets` (supports midnight-crossing via open/close time).
- **`staff.base_salary`/`hourly_rate`**, `outlets.labor_cost_target`, `payroll_records` — pay
  columns for F5 cost (currently empty, so `role_salary_configs` is the editable source).

### 3c. Schema divergence / integrity flags found (context, mostly out of scope)
- **`users.pending_approval`** is read/written by `007`/`009` but **never declared** in any
  migration — it exists on the live DB but a fresh rebuild from `001` would break. (Pre-
  existing; noted, not ours to fix.)
- `staff_documents` is defined twice (001 file_url scaffold vs 016 base64 vault); **016 not
  applied to live**, so prod still has the old shape.

---

## 4. Reusable Components (web) — map to the new screens

The web app has a full shadcn-style kit in `components/ui/` **but the shipped feature pages
often hand-roll tables/modals with raw Tailwind** (`bg-blue-600`, per-file `STATUS_CLS`
maps). **New screens will prefer the `ui/` primitives + semantic tokens + `Button`/`Badge`
variants** (avoids dark-mode gaps).

| Brief screen | Reuse (verbatim) | Build new |
|---|---|---|
| **F1 Documents** | `lib/image.ts` (`prepareDocumentForUpload`, `DOCUMENT_ACCEPT`); `components/staff/documents-card.tsx` (card + `UploadModal` + blob-fetch view); `staff:documents` gate; `Dialog`/`Sheet` | **embedded PDF `<iframe>` + image lightbox** (none exist), replace-flow, version drawer, expiry/missing filters + dashboard widgets |
| **F3 Restaurant cards** | `outlets/page.tsx` `OutletAccordion`, dashboard restaurant grid, `Card`, `Badge` (status pills) | per-role drill-down, 4-color status (green/yellow/red/blue + UNCONFIGURED) |
| **F4 Exec dashboard** | `CapacityStaffingSection` (stat cards + per-outlet table), the `next/dynamic({ssr:false})` + `hsl(var(--chart-N))` **Recharts recipe** (`capacity-chart.tsx`), Reports date-range bar | ~18-KPI batched card grid, 5 chart types (line/area/pie), trend charts fed by `staffing_snapshots` |
| **F5 Predictor** | form patterns (RHF+zod or house `useState`+`validate()`), `ForecastStrip`, `forecast:read` gate | predictor input form, cost breakdown, strategy output card |
| **F6 Transfer recs** | `components/dashboard/rebalancing-card.tsx` (cross-outlet suggestion card), `/allocation` page as accept target | persisted rec list w/ status + confidence + reason, accept/reject actions |

**Cross-cutting (every screen):** `apiClient` from `@/lib/api-client` (the live one; ignore
`lib/api.ts`), `toast` from `@/components/ui/sonner`, `useAuthStore` from
`@/store/auth.store`, `hasPermission()`/`isAdminRole()`, register routes in
`components/layout/nav.ts` (auto-adds to sidebar + ⌘K), `Skeleton`/`EmptyState` for
loading/empty, **semantic tokens only**. Global `MutationCache.onError` already auto-toasts
failures.

---

## 5. Proposed Schema (table specs — additive, migrations `019`+)

Every new table: UUID PK, `tenant_id` FK, `created_at`, `updated_at` (via the existing
`set_updated_at()` trigger), `created_by`/`updated_by` where meaningful, and — per the brief
— **`deleted_at` (soft delete)**. **Soft-delete is applied to NEW tables only**; existing
tables are untouched (see §13.7). Immutable audit tables intentionally omit `updated_at`/
`deleted_at`.

**Migration 019 — Documents domain (F1)**
- `document_types` — `id, tenant_id, key UNIQUE, name, is_mandatory bool, requires_number
  bool, requires_expiry bool, sort_order, is_active, ts, deleted_at`. Seed the 14 brief
  types; `is_mandatory` for Aadhaar/PAN/Bank Passbook by default (§13.5).
- **ALTER `staff_documents`** (additive only): `+ document_type_id FK→document_types`,
  `+ status TEXT CHECK IN ('valid','expired','pending')` (Missing is virtual),
  `+ current_version INT DEFAULT 1`, `+ notes TEXT`, `+ doc_number_encrypted BYTEA`
  (app-layer AES-GCM; supersedes plaintext `doc_number_masked` for non-Aadhaar),
  `+ storage_key TEXT` (if object storage chosen, §13.1), `+ updated_by`, `+ updated_at`,
  `+ deleted_at`. Backfill `document_type_id` from the existing `doc_type`. Add
  `UNIQUE(staff_id, document_type_id) WHERE deleted_at IS NULL` (one active doc per type).
- `staff_document_versions` — `id, tenant_id, document_id FK, version_no, file_ref
  (storage_key|encrypted bytes), file_name, mime_type, size_bytes, doc_number_masked,
  uploaded_by, uploaded_at, replaced_by, replaced_at, created_at`. Append-only.
- `document_access_logs` — `id, tenant_id, document_id, staff_id, actor_user_id, action
  CHECK IN ('upload','view','download','reveal','replace','delete'), ip_address, user_agent,
  created_at`. **Insert-only / immutable** (no update, no delete, no `deleted_at`).

**Migration 020 — Restaurant config & ratios (F2)**
- `restaurant_categories` — lookup: `id, tenant_id, name, sort_order, is_active, ts`. Seed
  Italian, Asian, Café, Cloud Kitchen, Fine Dining, Casual Dining, Fast Casual.
- `restaurant_configurations` — 1:1 with outlet: `id, tenant_id, outlet_id FK UNIQUE,
  category_id FK, area_sqft, kitchen_size_sqft, avg_daily_pax, peak_pax, lunch_capacity,
  dinner_capacity, pax_basis TEXT NULL (override), created_by, updated_by, ts, deleted_at`.
  **Does not duplicate** `outlets.seating_capacity / operating_hours / max_pax /
  total_tables` — those stay canonical on `outlets`.
- `staff_requirement_configurations` — per-restaurant per-role ratio: `id, tenant_id,
  outlet_id FK, position_id FK, guests_per_staff NUMERIC, min_staff INT, max_staff INT NULL,
  created_by, updated_by, ts, deleted_at`, `UNIQUE(outlet_id, position_id) WHERE deleted_at
  IS NULL`. (Chosen over reviving `labor_ratio_configs` so the table is born with
  `tenant_id` + audit + soft-delete; the dead scaffold is left untouched — §13.8.)
- `staff_requirement_config_history` — `id, tenant_id, outlet_id, position_id,
  old_guests_per_staff, new_guests_per_staff, old_min_staff, new_min_staff, changed_by,
  changed_at`. Immutable.
- `ratio_templates` — category defaults for prefilling new outlets + the predictor:
  `id, tenant_id, category_id FK, position_id FK (or role_key), guests_per_staff, min_staff,
  ts, deleted_at`. Seed from `staffing_ratios` × `post_category_map`.

**Migration 021 — Staffing engine snapshots (F3/F4 trends)**
- `staffing_snapshots` — `id, tenant_id, outlet_id FK, snapshot_date DATE, position_id FK
  NULL (NULL = outlet total), required, current, present, on_leave, transferred, available,
  shortage, excess, vacant, status TEXT, created_at`,
  `UNIQUE(outlet_id, snapshot_date, position_id)`. Written by the daily snapshot cron.

**Migration 022 — Predictor & transfers (F5/F6)**
- `role_salary_configs` — `id, tenant_id, position_id FK, avg_monthly_salary NUMERIC(12,2),
  currency DEFAULT 'INR', effective_from DATE, created_by, updated_by, ts, deleted_at`,
  `UNIQUE(tenant_id, position_id, effective_from)`.
- `staff_predictions` — `id, tenant_id, inputs JSONB, outputs JSONB, strategy_version TEXT,
  created_by, created_at, deleted_at`.
- `transfer_recommendations` — `id, tenant_id, from_outlet_id FK, to_outlet_id FK,
  position_id FK, headcount INT, confidence TEXT CHECK IN ('high','medium','low'), reason
  TEXT, status TEXT CHECK IN ('pending','accepted','rejected','executed') DEFAULT 'pending',
  generated_at, acted_by, acted_at, staff_transfer_id FK NULL (set on accept→execute), ts,
  deleted_at`.

**Migration 023 — Settings & permissions**
- Extend `tenant_settings` with `+ value_text TEXT NULL` (KV is `NUMERIC`-only today) to
  hold non-numeric knobs (`pax_basis`, feature-flag names). Seed: `t_excess`,
  `t_minor=0.15`, `pax_basis='peak_period'`, `signed_url_ttl_seconds=300`,
  `max_upload_bytes=10485760`, `feature:documents/staffing/predictions/transfers=1`.
- Seed new permission keys into `role_permissions` (010-style INSERT, per role, idempotent,
  + `_ROLLBACK`) — see §6.

### Indexes (each justified)
- `staff_documents(staff_id)` *(exists)*; `(document_type_id, status)` — powers the
  Missing/Expired filters; `(expires_on)` — the daily expiry scan + 30-day widget;
  `(tenant_id, deleted_at)` — soft-delete-aware scans.
- `staff_document_versions(document_id, version_no)` — version history fetch.
- `document_access_logs(document_id, created_at)`, `(tenant_id, actor_user_id, created_at)`
  — audit lookups by document and by actor.
- `staff_requirement_configurations(outlet_id)` + the unique — per-restaurant ratio reads.
- `staffing_snapshots(outlet_id, snapshot_date)` + `(tenant_id, snapshot_date)` — trend
  charts (30/90-day) and company rollups without scanning live tables.
- `transfer_recommendations(status, generated_at)`, `(from_outlet_id)`, `(to_outlet_id)` —
  the rec list + idempotent regeneration dedupe.
- `role_salary_configs(position_id, effective_from)` — latest-effective salary lookup.
- `staff_predictions(tenant_id, created_at)` — history pagination.

---

## 6. Proposed API Surface + RBAC

Matches conventions exactly: base `/api/v1` (Next rewrite, same-origin), `{ data }`
envelope, class-validator DTOs under the global `ValidationPipe`, `@RequirePermission` +
`PermissionsGuard`, outlet-scope helpers for "own restaurant", `{ data, pagination }` for
lists. Paths use code vocabulary (`staff`/`outlets`).

**Documents (F1)** — extend `staff-documents` module
```
GET    /staff/:id/documents                 (exists) list meta (owner-or-permission)
GET    /staff/:id/documents/:docId/content  (exists) inline bytes → keep, add audit log
POST   /staff/:id/documents                 (exists) upload → now versions + magic-byte check
PUT    /staff/:id/documents/:docId          NEW  replace (archives prior as a version)
DELETE /staff/:id/documents/:docId          (exists) → becomes soft-delete + audit
GET    /documents/:id/versions              NEW  version history
GET    /documents/:id/download              NEW  short-lived signed URL (rate-limited)
POST   /documents/:id/reveal-number         NEW  full number, permissioned + audited + rate-limited
GET    /documents/expiring?days=30          NEW  cross-staff, outlet-scoped
GET    /documents/missing?type=aadhaar      NEW  mandatory-type gaps, outlet-scoped
CRUD   /settings/document-types             NEW  HR manages the lookup
GET    /dashboard/document-widgets          NEW  expiring / missing / recently-uploaded
```
**Restaurant config & ratios (F2)**
```
GET/PUT /outlets/:id/configuration          NEW  (reads outlets + restaurant_configurations)
CRUD    /outlets/:id/staffing-ratios         NEW  per-role; writes history row
GET/PUT  /settings/staffing-ratios           (exists) category defaults → template layer
CRUD     /settings/ratio-templates           NEW  per-category templates
```
**Staffing engine + dashboard (F3/F4)**
```
GET /staffing/requirements?date=            NEW  all outlets (batched; no N+1)
GET /staffing/requirements/:outletId        NEW  role-level breakdown
GET /dashboard/company-staffing             NEW  one batched call, ≤10 queries, from snapshots+cache
```
**Predictor & transfers (F5/F6)**
```
POST /predictions                           NEW  run (persists to staff_predictions)
GET  /predictions                           NEW  history
CRUD /settings/role-salaries                NEW  role_salary_configs (HR)
GET  /transfer-recommendations              NEW  list (status/confidence)
POST /transfer-recommendations/regenerate   NEW  idempotent (skips pairs w/ pending recs)
POST /transfer-recommendations/:id/accept   NEW  → deep-links to existing /allocation flow
POST /transfer-recommendations/:id/reject   NEW
```

### New permission keys (≤60 chars; added to `PERMISSION_CATALOG` + seeded via 010-pattern)
Reuse wherever possible; **only 3 genuinely new keys**:
- `documents:status` — **NEW** — view completeness/status only (Managers/Supervisors; no
  files, no numbers).
- `documents:reveal` — **NEW** — reveal a full (unmasked) document number (Admin/HR only).
- `predictions:run` — **NEW** — run the staff predictor.
- **Reuse:** `staff:documents` (upload/view/download identity docs — Admin/HR),
  `allocation:read`/`allocation:write` (view / accept-reject transfer recs), `outlet:write`
  (edit restaurant config), `roles:manage` or a small `staffing:ratios` key (edit ratios —
  §13.9), `reports:read` (view dashboards).

### RBAC matrix mapped onto the real 6 roles
Real roles: `super_admin > admin > hr > head_of_house > chef > employee`. "Own restaurant"
is enforced by the **outlet-scope layer**, not by permission keys.

| Capability | super_admin | admin | hr | head_of_house *(Rest. Manager)* | chef *(Supervisor?)* | employee *(read-only?)* |
|---|---|---|---|---|---|---|
| View/download identity docs | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ (own only) |
| Upload/replace docs | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reveal full doc number | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| See doc completeness/status | ✅ | ✅ | ✅ | own outlet | own outlet | ❌ |
| Edit restaurant config & ratios | ✅ | ✅ | ✅ | own outlet | ❌ | ❌ |
| View staffing dashboards | ✅ | ✅ | ✅ | own outlet | own outlet | read-only? |
| Run staff predictions | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Accept/reject transfer recs | ✅ | ✅ | ✅ | involved outlets | ❌ | ❌ |

> **The brief's "Supervisor" and "Read-only" roles have no backing role** — `viewer` was
> deleted in migration `010`, and `employee` is self-service-only. This is **Open Question
> §13.6**. Recommended: map Supervisor→`chef`, and either reintroduce a `viewer` role or
> approximate read-only by narrowing a role's matrix on the Account Types page.

---

## 7. Required Changes — the calculation engines (pure + unit-tested)

The brief's engine formulas are adopted **verbatim** and live in **plain-TS pure services**
(no Nest DI, no `pg`) so they're trivially Jest-testable with the existing `DB_POOL`-mock
pattern. Nest services fetch inputs in **one batched query per concern** and call the pure
engine.

**F3 — Staffing Requirement Engine (`StaffingEngine.compute(inputs) → results`)**, deterministic:
```
effective_pax = basis=='peak_period' ? max(lunch_capacity, dinner_capacity) : average_daily_pax   # basis configurable, default peak_period
required(role)  = max( ceil(effective_pax / guests_per_staff(role)), min_staff(role) )
current(role)   = allocated(role) + transfers_in(role) − transfers_out(role)
available(role) = current(role) − on_leave(role)
present(role)   = attendance_checked_in(role)            # reporting only
shortage(role)  = max(0, required − available)
excess(role)    = max(0, available − required)
vacant(role)    = shortage(role)                          # no open-positions source today → §13
status: shortage==0 && excess<=T_excess → GREEN ; excess>T_excess → BLUE ;
        shortage/required <= T_minor(0.15) → YELLOW ; else → RED ;
        no config / zero-or-null ratio → UNCONFIGURED (never fake-green, never ÷0)
```
Input sources (mapped to real queries, all IST day boundaries):
- `guests_per_staff`/`min_staff`: **3-tier resolve** → `staff_requirement_configurations`
  (outlet×role) → `ratio_templates` (category×role) → company default.
- `effective_pax`: `restaurant_configurations` (fallback `outlets.max_pax`).
- `allocated`: `staff` grouped by `position_id` where `current_outlet_id=outlet AND
  employment_status='active'`.
- `transfers_in/out`: `staff_transfers` effective on `D` by `to_outlet`/`from_outlet` + role.
- `on_leave`: `leave_requests` (`approved`, `D` in range) via `staff.current_outlet_id`.
- `present`: `attendance_records` (`date=D`, status present/late/early_departure).
- Thresholds `T_excess`, `T_minor` from `tenant_settings` (company default; optional per-
  restaurant override — §13.4).

**F5 — Predictor (`PredictionStrategy` interface, `RatioBasedStrategy` v1)** — pluggable so
smarter formulas swap in without touching UI/API. v1 = category `ratio_templates` → company
defaults → same `required()` formula; cost from `role_salary_configs`. Every run persisted
to `staff_predictions` (inputs+outputs+`strategy_version`).

**F6 — Transfer recommendation engine** — consumes F3 per-role shortage/excess, greedy match
(donor stays GREEN), verbatim algorithm; confidence HIGH/MEDIUM/LOW; human-readable reason;
persisted to `transfer_recommendations`; **idempotent regeneration** (skip pairs already
covered by a `pending` rec); matcher = **chain of pluggable scorers** (`SkillScorer`,
`ExperienceScorer`, `DistanceScorer`, `ShiftScorer`, `LanguageScorer`) with v1 =
role-identity only. Accept → deep-link into the existing `/allocation` transfer flow (no
duplicated transfer logic).

**Background jobs (`@nestjs/schedule` `@Cron`, `timeZone:"Asia/Kolkata"`, early-morning IST,
all idempotent):**
1. **Document expiry scan** → flip `status` to `expired` where `expires_on < today(IST)`;
   emit `DocumentExpired`. (Never computed live per page load.)
2. **Staffing snapshot writer** → compute per-outlet per-role via the engine, upsert
   `staffing_snapshots` (powers trends + the pre-aggregated dashboard).
3. **Transfer recommendation generator** → regenerate `transfer_recommendations` idempotently.

**Security (F1, DPDP):** server-side **magic-byte + extension** validation (not just declared
MIME), randomized stored filenames, **app-layer AES-256-GCM** encryption of file bytes &
document numbers, **short-lived signed download URLs** (HMAC token, ≤5 min TTL), reveal
gated by `documents:reveal` + audited + rate-limited, and an **immutable
`document_access_logs`** row for every upload/view/download/reveal/replace/delete. Numbers
never appear in logs/URLs/errors.

**Performance (F10):** dashboard served from `staffing_snapshots` + a short-TTL cache
(target **≤10 queries, p95 < 2 s** at 20 outlets); list endpoints paginated (25–50), p95 <
500 ms; no `SELECT *`; engine batches inputs to kill N+1; lazy-load PDF previews + charts.

---

## 8. Migration Plan (additive + reversible; each ships a `_ROLLBACK.sql`)

| # | File | Adds | Rollback |
|---|---|---|---|
| **prereq** | apply `013`→`018` by hand first | password reset, outlet backfill, kiosk, **staff_documents vault, capacity model, tenant_settings** | existing rollbacks |
| 019 | `019_documents_domain.sql` | `document_types`, ALTER `staff_documents` (+status/version/encryption/audit cols/deleted_at), `staff_document_versions`, `document_access_logs`, seed types + `documents:reveal`/`documents:status` perms | drop new tables/cols/perms |
| 020 | `020_restaurant_config_ratios.sql` | `restaurant_categories`, `restaurant_configurations`, `staff_requirement_configurations` (+history), `ratio_templates` | drop |
| 021 | `021_staffing_snapshots.sql` | `staffing_snapshots` + indexes | drop |
| 022 | `022_predictor_transfers.sql` | `role_salary_configs`, `staff_predictions`, `transfer_recommendations` | drop |
| 023 | `023_settings_flags_perms.sql` | `tenant_settings.value_text`, threshold/flag seeds, `predictions:run` perm | drop col + perms |

**Rules honoured:** additive only — **no existing column/table is dropped, renamed, or
altered destructively** (the one `ALTER staff_documents` is `ADD COLUMN … NULL` +
backfill). Reversible. Idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`). Applied in
order after `018`.

---

## 9. Implementation Phases (each = migrations + API + UI + tests + phase report)

- **Phase 0 — this document → approval gate.** ← you are here.
- **Phase 1 — Documents (F1 + F7 docs tables).** Migr 019; extend `staff-documents`
  (encryption, magic-byte validation, versioning/replace, signed download, reveal, expiry
  cron, missing/expiring filters, dashboard widgets, immutable audit); web: PDF/image
  preview, version drawer, filters, widgets. RBAC + audit end-to-end.
- **Phase 2 — Restaurant config + ratios (F2).** Migr 020; config + per-role ratio + history
  + templates API/UI; category lookup.
- **Phase 3 — Engine + snapshots + cards + dashboard (F3/F4).** Migr 021; pure engine +
  unit tests (Edge-Case Gauntlet); snapshot cron; restaurant cards (4-color + UNCONFIGURED);
  batched, cached company dashboard; charts via the dynamic-import recipe.
- **Phase 4 — Predictor + transfer recs (F5/F6).** Migr 022; strategy-pattern predictor +
  cost + persistence; scored/persisted recommendations + generator cron + accept deep-link.
- **Phase 5 — Perf, seed data, docs.** Migr 023; indexes/caching/N+1 audit; demo seed (6
  outlets, ~50 staff, staggered doc expiries, deliberate missing Aadhaar/PAN, snapshot
  history for trends); update PROJECT_STATUS.md + README; devil pass.

**Definition of Done (per feature):** acceptance criteria met with evidence; pure engines
unit-tested against the Edge-Case Gauntlet; migrations verified up+down; existing modules
byte-identical (existing `auth.service.spec.ts` still green); RBAC server-side + audit;
loading/empty/error/success states on every screen; PLAN.md updated with deviations.

---

## 10. Testing Strategy
- **Pure engines (F3/F5/F6):** Jest unit tests in `apps/api/src/**/*.spec.ts` — no DB, no
  Nest. **Edge-Case Gauntlet:** zero pax · unconfigured restaurant · closed today · ratio
  zero/null (no ÷0) · all staff on leave · transferred-in-and-on-leave same day · ratio
  edited mid-day · operating hours crossing midnight (IST) · expiry_date = today · duplicate
  active doc type.
- **Service/permission tests:** mock `DB_POOL` (proven pattern) to assert RBAC gating,
  outlet-scope, audit-log writes, and the signed-URL/reveal paths.
- **Migration tests:** apply + rollback each `019`–`023` against a scratch DB.
- **Web:** no test harness exists today; **not adding one is the default** (out of scope
  unless you want it — §13). Manual verify in light+dark + 360 px, per house practice.

---

## 11. Risks

1. **`013`–`018` unapplied to live** — hard prerequisite; until hand-applied, the features
   they underpin (and ours) error. *Mitigation:* Phase-1 runbook step; new code degrades to
   a neutral "not set up yet" state (existing pattern).
2. **Sydney DB latency (~470 ms)** — the F4 dashboard budget (≤10 queries, <2 s) is only met
   via `staffing_snapshots` pre-aggregation + caching; a naive per-outlet loop across 20
   outlets × 13 roles would be catastrophic N+1. *Mitigation:* snapshot cron + batched reads.
3. **Allocation (transfer) module is unscoped/untenanted and ignores `effective_date`** —
   F6 deep-links into it. *Mitigation:* recs are advisory; humans accept → existing flow; we
   **do not auto-execute**. Hardening allocation is **Open Question §13.6**, not assumed.
4. **Supervisor/Read-only roles don't exist** — the 5-role brief matrix can't map 1:1
   (§13.6).
5. **No object storage wired; docs are base64-in-Postgres today** — DPDP encryption +
   signed URLs need either app-layer crypto (low friction) or Supabase Storage (strategic)
   (§13.1). 10 MB base64 rows are heavy in Postgres.
6. **No magic-byte validation today** — a crafted file could bypass MIME checks; we add
   sniffing (brief acceptance criterion).
7. **Encryption-at-rest change** — introduces an encryption key to manage (env/secret);
   key loss = unrecoverable docs. *Mitigation:* since `016` is unapplied to live, there's no
   plaintext backfill yet; document key custody in the runbook.
8. **Position tags are rough** (e.g. 42 staff tagged "Outlet Manager") — per-role variance is
   only as good as the tags; **no Bar position exists**, so any Bar ratio manufactures a
   phantom shortage (must be zeroed for dine-in).
9. **`tenant_settings.value` is `NUMERIC`-only** — string settings need the additive
   `value_text` column (023).
10. **Two web api-clients / two auth-stores / duplicated `STATUS_CLS`** — building on the
    wrong one is a trap; plan pins the live ones (`lib/api-client.ts`, `store/auth.store.ts`).
11. **`@types/jest` v30 vs jest 29 skew** — minor typing friction; pin or ignore.
12. **`users.pending_approval` undeclared in migrations** (pre-existing) — a fresh rebuild
    from `001` breaks `007`/`009`; flagged, not ours to fix here.

---

## 12. Assumptions
1. **Single tenant in practice** (scheduler hardcodes `TENANT_ID`), but all new tables carry
   `tenant_id` for consistency with the newer schema.
2. Vocabulary: brief **employee=`staff`**, **restaurant=`outlet`**, **role/designation=
   `position`**. Brand stays **WorkforceIQ**.
3. **All "today"/day-boundary logic and all crons run in Asia/Kolkata (IST)** — matches the
   existing `rotation.scheduler.ts` and the expanded brief.
4. Migrations remain **hand-applied**; no runner is introduced. New numbers start at `019`.
5. **Recharts** for all charts (via the dynamic-import recipe); **Jest (API only)** for
   tests; **no web test framework** is added.
6. **`deleted_at` (soft delete) is added to NEW tables only.** Existing tables are not
   retrofitted (that refactor is explicitly out of scope).
7. **F6 recommendations are advisory** and never auto-execute a transfer; execution stays
   the human `/allocation` flow.
8. `staff_documents` (016, unapplied to live) is **extended in place**, keeping the name and
   the base64/encrypted content model unless §13.1 selects object storage.

---

## 13. Open Questions — **answer these before Phase 1** (recommendation given for each)

1. **File storage target?** *Recommendation:* **Supabase Storage** (private bucket, S3-
   compatible, native at-rest encryption + expiring signed URLs) — you're already on
   Supabase (see `docs/SUPABASE-WIRING.md`), it satisfies DPDP cleanly, lifts the 2 MB→10 MB
   ceiling, and takes big blobs out of Postgres. **Lower-friction fallback:** keep base64
   *in Postgres* but add **app-layer AES-256-GCM** encryption + an **HMAC short-lived signed-
   download endpoint** (no new infra). Which do you want? *(I lean Supabase Storage.)*
2. **Role master & salaries?** *Recommendation:* create **`role_salary_configs` fresh**
   (position→avg monthly salary, `effective_from`, HR-editable). The pay *columns* exist
   (`staff.base_salary`, `payroll_records`) but are **empty**, so a role→salary master is the
   right editable source. Confirm salary is keyed by **`position`** (finest grain) with a
   category rollup for the predictor. OK?
3. **Source of truth for "present today"?** *Recommendation:* **both, kept distinct** —
   "Current/allocated" from `current_outlet_id`+roster (± same-day transfers), "**Present**"
   from **attendance check-in** (`attendance_records`), "On leave" from `leave_requests`.
   This matches the engine formula exactly. OK?
4. **Color thresholds — company-wide or per-restaurant?** *Recommendation:* **company-wide
   defaults in `tenant_settings`** (`T_excess`, `T_minor=15%`, `pax_basis=peak_period`) for
   v1, with a **nullable per-restaurant override** in `restaurant_configurations` that falls
   back to the company default. Start company-wide?
5. **Mandatory document set — same for all, or varies by role/employment type?**
   *Recommendation:* **company-wide** via `document_types.is_mandatory` for v1 — default
   mandatory = **Aadhaar, PAN, Bank Passbook**. Role/employment-type variation is a future
   mapping table. Confirm the mandatory set (and whether Photo/Address Proof should be
   mandatory too).
6. **Supervisor & Read-only roles (they don't exist).** *Recommendation:* map
   **Restaurant Manager→`head_of_house`**, **Supervisor→`chef`**; for **Read-only**, either
   (a) reintroduce a `viewer` role (new enum value + migration), or (b) create a role on the
   Account Types page narrowed to `*:read` keys. Which? And — **should we harden the
   unscoped/untenanted `allocation` transfer module** as part of this work, or leave it
   untouched (out of scope)? *(I recommend leaving it untouched now and filing it as a
   follow-up, since it's an existing module.)*
7. **Soft-delete scope.** Confirm you're happy with **`deleted_at` on new tables only** (not
   retrofitting existing tables) — this satisfies the brief additively without a risky
   repo-wide refactor. OK?
8. **`staff_requirement_configurations` vs reviving `labor_ratio_configs`.**
   *Recommendation:* **new table** (born with `tenant_id`+audit+soft-delete), leaving the
   dead `labor_ratio_configs` scaffold untouched. OK, or would you prefer we revive the
   existing scaffold?
9. **Ratio-edit permission.** Reuse the existing **`roles:manage`** gate (current behaviour)
   for editing ratios, or introduce a dedicated **`staffing:ratios`** key? *(I lean a
   dedicated key so HR can delegate ratio edits without granting full role management.)*
10. **Web tests.** None exist. Add a light component-test harness (Vitest + Testing Library)
    for the new screens, or keep to API unit tests + manual verify (house practice)? *(I
    lean API tests + manual for now to avoid scope creep.)*

---

## 14. Approval Gate — ✅ APPROVED 2026-07-09

**Approved: "use my recommended defaults" for all 10 open questions**, with four forks
confirmed explicitly:

| § | Decision (locked) |
|---|---|
| 13.1 | **Supabase Storage** — private bucket, native at-rest encryption + expiring signed URLs; big blobs leave Postgres; 10 MB cap. Requires a human-ops step (bucket + `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` env). |
| 13.2 | `role_salary_configs` **fresh**, keyed by `position`, category rollup for predictor. |
| 13.3 | Present = **attendance check-in**; current = roster/`current_outlet_id` ± same-day transfers; on-leave = `leave_requests`. Kept distinct. |
| 13.4 | Thresholds **company-wide in `tenant_settings`** (`T_excess`, `T_minor=15%`, `pax_basis=peak_period`) + nullable per-restaurant override. |
| 13.5 | Mandatory docs **company-wide** via `document_types.is_mandatory`; default = **Aadhaar, PAN, Bank Passbook**. |
| 13.6 | Restaurant Manager→`head_of_house`, Supervisor→`chef`, Read-only→**matrix-narrowed role** (no enum churn). **Allocation module left untouched — deep-link only**; its gaps filed as a follow-up. |
| 13.7 | Soft-delete **new tables only**. |
| 13.8 | **New `staff_requirement_configurations`** table (dead `labor_ratio_configs` left untouched). |
| 13.9 | Dedicated **`staffing:ratios`** permission key for ratio edits. |
| 13.10 | **API unit tests + manual verify** (house practice); no web test framework added. |

```
Status: PHASE 0 COMPLETE + APPROVED. Proceeding to Phase 1 — Documents.
```

### Delivery status (updated 2026-07-09)

**All phases 1–5 implemented and verified green** (`tsc` api+web · `pnpm lint` 0 errors ·
`pnpm test` 58 pass · `pnpm build` ✓). Additive migrations `019`–`023` written with rollbacks.
**Not yet committed; migrations not yet applied to live.**

| Phase | Feature | Migration | Doc |
|---|---|---|---|
| 1 | Employee Documents (F1) | 019 | [PHASE-1-DOCUMENTS.md](PHASE-1-DOCUMENTS.md) |
| 2 | Restaurant Config & Ratios (F2) | 020 | [PHASE-2-CONFIG-RATIOS.md](PHASE-2-CONFIG-RATIOS.md) |
| 3 | Staffing Engine + Company Dashboard (F3, F4) | 021 | [PHASE-3-STAFFING-ENGINE.md](PHASE-3-STAFFING-ENGINE.md) |
| 4 | Predictor + Transfer Recommendations (F5, F6) | 022 | [PHASE-4-PREDICTOR-TRANSFERS.md](PHASE-4-PREDICTOR-TRANSFERS.md) |
| 5 | Performance, seed data, docs | 023 | [WORKFORCE-INTELLIGENCE.md](WORKFORCE-INTELLIGENCE.md) |

Go-live runbook: [WORKFORCE-INTELLIGENCE.md](WORKFORCE-INTELLIGENCE.md#go-live-runbook-human-ops--the-code-cant-do-these).
