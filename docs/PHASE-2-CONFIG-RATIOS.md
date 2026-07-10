# Phase 2 — Restaurant Configuration & Staffing Ratios (F2)

> Part of the Workforce Intelligence extension (`docs/PLAN.md`). Additive & reversible; no
> existing module rewritten. Branch `perf/login-latency`.

## What shipped

**Migration `020_restaurant_config_ratios.sql` (+rollback)** — additive:
- `restaurant_categories` (7 seeded: Italian, Asian, Café, Cloud Kitchen, Fine Dining, Casual Dining, Fast Casual).
- `restaurant_configurations` (1:1 outlet) — category, area sqft, kitchen size, avg/peak pax, lunch/dinner capacity, + optional per-restaurant `pax_basis`/`t_excess`/`t_minor` overrides (PLAN §13.4). Does **not** duplicate `outlets.*` capacity columns.
- `staff_requirement_configurations` — per outlet × **role** (`positions`) `guests_per_staff` + `min_staff`/`max_staff`; unique active `(outlet, position)`.
- `staff_requirement_config_history` — immutable who/when/old→new.
- `ratio_templates` — category → role defaults.
- Permission **`staffing:ratios`** (admin/hr/head_of_house). *(The dead 001 `labor_ratio_configs` scaffold is consciously superseded, left untouched.)*

**API** (`modules/restaurant-config`, exported for the Phase-3 engine):
- `GET/PUT /outlets/:id/configuration` — config (view = `allocation:read`, edit = `staffing:ratios` + outlet scope; upsert with COALESCE partial update).
- `GET/PUT /outlets/:id/staffing-ratios` — per-role ratios; PUT writes **history rows** for changed rows only (pure `diffRatios`); validates positions belong to the tenant, `max ≥ min`.
- `GET /outlets/:id/staffing-ratios/history`.
- `POST /outlets/:id/staffing-ratios/apply-template` — prefill from a category template, **falling back to company category defaults** (`staffing_ratios` × `post_category_map`) for uncovered roles.
- `GET/POST /settings/restaurant-categories`, `GET/PUT /settings/ratio-templates`.

**Web**:
- `RestaurantConfigCard` on `/outlets/[id]` — config fields (category + area/kitchen/pax/capacities), per-role ratios editor (every position, blank = unmodelled), **Prefill from template**, **ratio history drawer**. Self-hides without `allocation:read`; read-only without `staffing:ratios`.
- `/settings/ratio-templates` page — per-category template editor. Nav entry added.

**Tests**: `ratio-diff.spec.ts` — 5 tests (new row → null old fields, unchanged ignored, guests-per-staff change, min-only change, mixed batch). Total suite: **34/34**.

## DoD status
`tsc --noEmit` clean (api + web) · `pnpm lint` 0 errors · `pnpm test` 34/34 · `pnpm build` ✓ · existing modules untouched.

## How it feeds Phase 3
The staffing engine will resolve `guests_per_staff(outlet, role)` in 3 tiers:
**`staff_requirement_configurations` (outlet×role) → `ratio_templates` (category×role) → company `staffing_ratios` (category default)** — and read `effective_pax`/thresholds from `restaurant_configurations` (falling back to `outlets.max_pax` + tenant `tenant_settings`).

## Human-ops
- Apply **`020_restaurant_config_ratios.sql`** (after 019). `staffing:ratios` seeded for admin/hr/head_of_house.
- Configure each outlet (category + capacities) and set per-role ratios (or Prefill from a category template) on the outlet page.
