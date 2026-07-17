# WorkforceIQ — System Load & Status Report

_Generated 2026-07-14. A point-in-time inventory of the API surface, background
work, performance hotspots, and build status._

## Context

This report defines: every API call, every background process, everything that
"takes load," how much work is done vs. remaining, and which modules are the heaviest.

**The single most important finding first:** this application uses **ZERO Claude
tokens — and zero of any LLM (Claude / OpenAI / Anthropic API) at runtime.** A
whole-repo search for any AI/LLM SDK or HTTP call returned only false positives.
Every "AI" feature (PAX prediction, Staffing Autopilot, transfer recommendations,
demand forecast) is **deterministic TypeScript + SQL math** — weighted averages,
ratios, and a greedy matching loop. The optional Python ML service is also just
rule-based, is **disabled by default** (`ENABLE_ML_FORECASTING=false`), and is not
deployed.

So the honest answer to _"which modules have high Claude-token usage"_ is: **none —
there is no token cost anywhere.** The rest of this report therefore reframes
"excess token/load" as what actually costs money and latency: **database round-trips
to the remote Supabase Postgres in Sydney**, which is the real and only performance
bottleneck.

---

## 1. All API calls — 159 endpoints across 28 modules

Global prefix on every route: `/api/v1`. Auth: a **fail-closed global JWT guard** —
everything requires a token unless explicitly `@Public` (7 routes).

**By HTTP method:** GET 89 · POST 39 · PUT 20 · DELETE 9 · PATCH 2 = **159 total**

**By module (endpoint count):**

| Module | # | What it does |
|---|---|---|
| scheduling | 18 | Rosters, shifts, publish, assign, swaps, overrides, coverage |
| auth | 12 | Login, register, refresh, accounts, password resets |
| outlet | 10 | Outlets CRUD, capacity, headcount, labor cost, rebalancing |
| forecasting | 11 (2 ctrls) | PAX prediction, autopilot, suggestions, pax-data + history |
| dashboard | 8 | Overview, KPIs, hierarchy, heatmaps, labor trend |
| me | 8 | Self-service: profile, shifts, attendance, leave, docs |
| staff | 9 | Staff CRUD, avatar, attendance/leave summaries |
| attendance | 7 | Clock in/out, manual entry, corrections, live status |
| leave | 6 | Requests, review, balances, calendar, types |
| notification | 6 | List, unread, preferences, mark-read |
| restaurant-config | 10 (2 ctrls) | Per-outlet configuration + staffing ratios + templates |
| staff-documents | 15 (3 ctrls) | Document vault, types, versions, download, reveal-number |
| kiosk | 7 (2 ctrls) | Admin device mgmt + device-token clock-in |
| staffing | 4 (2 ctrls) | Requirements, trend, company-staffing |
| transfer-recommendations | 4 | Generate / accept / reject cross-outlet transfers |
| allocation | 4 | Transfers + suggestions |
| predictions | 4 | Headcount prediction + role-salary settings |
| capacity | 3 (2 ctrls) | Staffing projection + ratio settings |
| department | 5 | Departments + positions |
| roles | 3 | RBAC permission matrix editor |
| reports | 2 | Payroll + attendance CSV export |
| audit | 1 | Audit-log viewer |
| health / public | 2 | Health check + public "my-week" token link |

**7 public (unauthenticated) routes:** `auth/login`, `auth/register`,
`auth/refresh`, `health`, `public/my-week/:token`, kiosk clock endpoints
(device-token guarded), and `documents/:id/file` (signed-HMAC-token guarded).

---

## 2. All background processes

**No LLM calls, no WebSocket gateways.** Everything is scheduled DB/queue work:

**Scheduled jobs (`@nestjs/schedule`, in-process, IST):**

| Job | When | Cost |
|---|---|---|
| Weekly rotation generation | Mon 00:05 | Loops every active outlet → ~5 round-trips each |
| Document-expiry scan | Daily 01:15 | One scan query per tenant |
| Staffing snapshot write | Daily 01:30 | 11 queries + one bulk upsert **per tenant** |
| DB keep-warm | Every 4 min | 1 trivial `SELECT 1` (stops Supabase idle-pausing) |

**On-boot hooks:** rotation backfill (fills any missing week's schedules on
startup); reminder registration (registers the Bull repeatables — now fire-and-forget
with an 8s timeout so a dead Redis can't hang boot).

**Bull queues (Redis-backed; degrade gracefully if Redis is absent):**
- `notifications` — nightly shift reminder (20:00), document-expiry reminder (02:30),
  and on-demand dispatch (in-app + WhatsApp/email).
- `auto-schedule` — async roster generation.

**External services** (all optional / mocked by default): Postgres (required),
Redis (optional), Supabase Storage (documents), Meta WhatsApp (mock unless keyed),
SendGrid (mock unless keyed), internal Python ML service (disabled).

---

## 3. What actually "takes load" — ranked by DB round-trip cost

The DB is remote (Supabase, Sydney) with the pool cap deliberately lowered to **10**.
So the cost that matters is **concurrent round-trips**; >10 at once saturates the pool
and can starve cheap requests like login. Heaviest operations:

1. **`staffing.buildResults`** — fires **11 queries in one `Promise.all`**; a single
   dashboard load can consume the whole pool. Mitigated by a **30s in-process cache**.
   _(Biggest live hotspot.)_
2. **`scheduling.autoGenerateRotation`** — heaviest write path; was ~240 round-trips
   (~110s), rewritten to ~5 via set-based `INSERT … SELECT … unnest`. Still runs once
   per outlet in the Monday cron loop.
3. **`staffing.writeSnapshots`** (nightly cron) — `buildResults` **uncached** for all
   outlets, looped over every tenant.
4. **`forecasting.getStaffingAutopilot`** — 2–3 queries + O(outlets) JS compute +
   greedy transfer-matching loop.
5. **`reports.attendanceCsv`** — **unbounded** result set (no LIMIT) streamed
   cross-region into one in-memory CSV string; the heaviest single read.
6. **`forecasting.importDailyPax`** — up to 5,000 rows → one giant multi-row INSERT
   (~20k bind params); capped but a large payload.
7. **Dashboard endpoints** — many small `Promise.all` bursts (4 parallel counts each)
   that add to the same pool pressure.

**Caching already in place:** a tiny in-process `TtlCache` (not Redis — single
instance) powers the 30s staffing cache and the roles/permission + outlet-scope caches
that remove a DB round-trip from **every authenticated request**.

---

## 4. Which modules are the "heaviest" (the real answer to "high usage")

By code size **and** runtime load:

| Rank | Module | Lines | Why it's heavy |
|---|---|---|---|
| 1 | **scheduling** | 1,351 | Biggest service (861 lines); rotation + publish + assign + swaps + Bull processor. Heaviest write path. |
| 2 | **staff-documents** | 1,254 | Most files (12): AES-256-GCM crypto, storage, magic-byte validation, expiry cron. |
| 3 | **notification** | 1,153 | Dispatch worker + WhatsApp/email providers + templates + Bull queue. |
| 4 | **forecasting** | 700 | All the "AI" math (autopilot, PAX prediction, imports) in one 487-line service. |
| 5 | **staffing** | 625 | The 11-query pool-saturation hotspot + nightly snapshot cron. |
| — | auth 745 · restaurant-config 544 · capacity 435 · staff 411 · dashboard 331 | | |

Heaviest **web pages**: scheduling (750 lines), outlets (636), staff (589).

---

## 5. How much is done vs. remaining

### Done (built + shipped)
Full platform: employee directory, weekly rotation rostering (draft→publish),
attendance, leave, allocation, capacity planning, staffing ratios, document vault
(encrypted), demand forecast + PAX prediction + Staffing Autopilot, kiosk clock-in,
PWA, i18n (en/gu/hi), RBAC with editable permission matrix, notifications
(in-app + WhatsApp/email), CSV payroll/attendance export, audit trail. Real data
loaded (~248 active staff, 6 dine-in outlets, 366 rows PAX history).

### Done (hardening — branch `feat/roadmap-hardening`)
17 commits, ~88 files, adversarially reviewed (12 defects found & fixed):
fail-closed JWT guard, closed RBAC scoping gaps, DTO validation on all 34 inline
handlers, set-based schedule generation, staffing read-cache, migration 025
(indexes + CHECK constraints), slow-query logging, IST pinned. **101 unit + 17 e2e
tests green.** CI workflow committed.

### Remaining — in code (small)
- **Accessible-modal rollout** across 7 pages (foundation done; needs the per-page
  swap + a browser QA pass on **Node 20** — the dev bundler won't run on Node 24).
- The branch is **intentionally not merged to `main`** yet (merging auto-deploys the
  live web app).

### Remaining — owner actions (cannot be done in code; need action on Supabase/Render)
Ordered by priority:
1. **Rotate the DB password** + enable Supabase network restrictions + confirm
   backups/PITR (free tier has none and auto-pauses).
2. **Apply pending migrations** in Supabase SQL editor: `APPLY-024`, then `APPLY-025`.
3. **Set `DOCUMENT_ENCRYPTION_KEY`** on the API before storing real PII (else document
   bytes are stored unencrypted).
4. **Collapse the two-repo split-brain** — web deploys from your repo, API from a
   diverged `bookends` repo missing the documents feature; re-point API to
   `prathamgosai/staff-management` `main` (do steps 2 & 3 first or the build 500s).
5. **Resume the Render API service** (currently suspended) — the immediate reason prod
   shows "server starting up."
6. Turn on the CI branch-protection gate; optionally set `APP_TZ=Asia/Kolkata`; stand
   up a staging tier so you stop testing against the sole live DB.
