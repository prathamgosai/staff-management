# Phase 4 — Staff Predictor (F5) + Intelligent Transfer Recommendations (F6)

> Part of the Workforce Intelligence extension (`docs/PLAN.md`). Additive & reversible; the
> existing allocation/transfer module is untouched (F6 deep-links into it). Branch `perf/login-latency`.

## What shipped

**Migration `022_predictor_transfers.sql` (+rollback)** — additive, soft-delete:
- `role_salary_configs` — position → avg monthly salary (effective-dated, HR-editable).
- `staff_predictions` — every predictor run (inputs+outputs JSONB + strategy_version) for training data.
- `transfer_recommendations` — persisted scored moves with status lifecycle (pending/accepted/rejected/executed); **partial unique index keeps ≤1 pending rec per from→to→role** (idempotent regeneration); optional `staff_transfer_id` link.
- Permission `predictions:run` (admin/hr/head_of_house).

**F5 Predictor** (`modules/predictions`):
- Pure **`PredictionStrategy`** interface + **`RatioBasedStrategy` v1** (`prediction-strategy.ts`): resolves each role's ratio (category template → company category default) and salary, computes `headcount = max(⌈peak_pax/guests⌉, floor)`, monthly payroll, department breakdown, cost-per-pax, pax-per-staff. Pure → **6 unit tests** (incl. zero-pax, partial-payroll).
- `PredictionsService` fetches ratios+salaries, runs the strategy, **persists** to `staff_predictions`. Endpoints `POST/GET /predictions` (predictions:run); `GET/PUT /settings/role-salaries` (Admin/HR only, enforced in-service).
- Web `/predictions` — input form (category, area, seating, lunch/dinner/daily pax, avg bill), result tiles (total staff, ₹ monthly payroll, cost/pax, pax/staff), per-role table + department breakdown, partial-payroll warning. `/settings/role-salaries` manager.

**F6 Transfer Recommendations** (`modules/transfer-recommendations`):
- Pure **greedy matcher** (`transfer-matcher.ts`) — per role, surplus→shortage, donor never dropped below GREEN; confidence HIGH/MEDIUM/LOW via a **pluggable scorer chain** (`TransferScorer`; v1 = `RoleIdentityScorer`); human-readable reason. Pure → **6 unit tests** (brief example, partial fill, distribution, same-role-only).
- `TransferRecommendationsService` consumes `StaffingService.buildResults` (live surplus/shortage), persists recs (idempotent), and `accept` returns a **deep-link into `/allocation`** — no transfer logic duplicated. Endpoints: `GET /transfer-recommendations`, `POST /transfer-recommendations/regenerate` (allocation:read), `POST …/:id/accept|reject` (allocation:write), outlet-scoped.
- Web `TransferRecommendationsCard` on `/staffing` — pending recs with confidence + reason, Regenerate, Accept (→ opens `/allocation`) / Reject. Self-hides without `allocation:read`.

**Tests**: 12 new (58 total).

## DoD status
`tsc --noEmit` clean (api + web) · `pnpm lint` 0 errors · `pnpm test` **58/58** · `pnpm build` ✓ · allocation module byte-identical.

## Notes
- Accept marks the rec `accepted` and deep-links a human to `/allocation` to pick the specific staff member and create the actual transfer (the existing flow). `executed` is reserved for when a linked transfer is created.
- Predictor cost uses `role_salary_configs` averages (HR-managed); managers running predictions see aggregate payroll, not individual pay. `cost_per_pax = payroll / (peak_pax × 30 days)`.

## Human-ops
- Apply **`022_predictor_transfers.sql`** (after 021). `predictions:run` seeded for admin/hr/head_of_house.
- Enter role averages at `/settings/role-salaries` (Admin/HR) so the predictor shows payroll.
- Generate transfer recommendations from the `/staffing` page (Regenerate); accept → complete the transfer in `/allocation`.
