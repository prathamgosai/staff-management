# Phase 3 — Real-Time Staffing Engine + Company Dashboard (F3, F4)

> Part of the Workforce Intelligence extension (`docs/PLAN.md`). Additive & reversible; no
> existing module rewritten. Branch `perf/login-latency`.

## What shipped

**Migration `021_staffing_snapshots.sql` (+rollback)** — `staffing_snapshots` (per outlet ×
date × role: required/current/present/on_leave/transferred_in/out/available/shortage/excess/
vacant/status; unique (outlet,date,position); indexes (outlet,date) + (tenant,date)), and
seeds engine thresholds `t_excess=1`, `t_minor=0.15` into `tenant_settings`.

**Pure engine** (`staffing/staffing-engine.ts`) — deterministic, no DB/Nest. Brief formulas verbatim:
`required = max(⌈effective_pax/guests_per_staff⌉, min_staff)`, `available = current − on_leave`,
`shortage/excess/vacant`, 4-colour status (🟢 within `t_excess` · 🔵 excess>`t_excess` ·
🟡 shortage/required ≤ `t_minor` · 🔴 else) + explicit ⚪ **UNCONFIGURED** (no capacity / no ratio →
never fake-green, never ÷0). Unmapped roles (Support/ODC) report headcount but contribute 0 to
demand math (no phantom excess). **13 Gauntlet unit tests.**

**Service** (`StaffingService`) — fetches all inputs in **~11 batched, grouped queries (no
per-outlet N+1)** and composes via the engine. **3-tier ratio resolution:**
`staff_requirement_configurations` (outlet×role) → `ratio_templates` (restaurant-category×role)
→ `staffing_ratios` (company staff-category default). `effective_pax` from
`restaurant_configurations` (basis peak_period/average_daily, per-outlet override) → `outlets.max_pax`.
`current` = active staff by `current_outlet_id` (already reflects approved transfers); leave =
`leave_requests`; present = `attendance_records`; transfers in/out = `staff_transfers` (reporting overlays).
All outlet-scoped.

**Endpoints** (gated `allocation:read`):
- `GET /staffing/requirements?date=` — card-grid summary (every outlet).
- `GET /staffing/requirements/:outletId?date=` — per-role breakdown.
- `GET /staffing/requirements/:outletId/trend?days=` — required-vs-available from snapshots.
- `GET /dashboard/company-staffing?date=` — one batched call: ~16 KPIs + status breakdown + per-outlet distribution.

**`StaffingScheduler`** — daily `@Cron(01:30 Asia/Kolkata)` upserts `staffing_snapshots` per tenant (idempotent).

**Web** — `/staffing` executive dashboard: 16 KPI cards, dynamically-imported Recharts (Required-vs-Current + Excess-vs-Shortage, token colours), restaurant **cards grid with 4-colour status** + Excess/Shortage, and a **per-role drill-down drawer**. Nav entry under Insights. Recharts stays lazy (route first-load excludes the chart chunk).

## DoD status
`tsc --noEmit` clean (api + web) · `pnpm lint` 0 errors · `pnpm test` **47/47** · `pnpm build` ✓ · existing modules untouched.

## Notes / deviations
- `current` already reflects approved transfers (the allocation flow flips `current_outlet_id`), so `transferred_in/out` are **reporting overlays**, not re-added to `current` — avoids double-counting while honouring the formula's intent.
- Bar/Support company defaults still model dine-in demand; zero them per-outlet (Phase-2 ratios) or on the company Staffing-ratios page — documented tuning caveat.
- Dashboard is served live (batched, cached 60 s client-side); **trend charts** read persisted `staffing_snapshots` (needs the cron to have run, or a manual snapshot).

## Human-ops
- Apply **`021_staffing_snapshots.sql`** (after 020). Thresholds `t_excess`/`t_minor` seeded.
- Set outlet capacity (`max_pax` or `restaurant_configurations`) + per-role ratios (Phase 2) so outlets leave the ⚪ UNCONFIGURED state.
- The snapshot cron runs 01:30 IST; trends populate over subsequent days.
