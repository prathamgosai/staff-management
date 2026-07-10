# Workforce Intelligence Extension — Overview

A cohesive extension turning WorkforceIQ ("Bookend Shifty") into a workforce-intelligence
platform: employee documents, restaurant configuration & staffing ratios, a real-time staffing
engine, an executive company dashboard, a staff predictor, and intelligent transfer
recommendations. **Built additively — no existing module (Employee, Shifts, Attendance, Leave,
Allocation/Transfer, Restaurant staffing, RBAC) was rewritten.**

Phase-by-phase detail: [PLAN.md](PLAN.md) · [Phase 1](PHASE-1-DOCUMENTS.md) ·
[Phase 2](PHASE-2-CONFIG-RATIOS.md) · [Phase 3](PHASE-3-STAFFING-ENGINE.md) ·
[Phase 4](PHASE-4-PREDICTOR-TRANSFERS.md).

## Feature → where it lives

| Feature | API module | Web | Key tables (migration) |
|---|---|---|---|
| **F1 Employee Documents** | `staff-documents` | `documents-card`, `/documents`, `/settings/document-types` | `document_types`, `staff_documents`+, `staff_document_versions`, `document_access_logs` (019) |
| **F2 Restaurant Config & Ratios** | `restaurant-config` | `RestaurantConfigCard` on `/outlets/[id]`, `/settings/ratio-templates` | `restaurant_categories`, `restaurant_configurations`, `staff_requirement_configurations`(+history), `ratio_templates` (020) |
| **F3 Staffing Engine + F4 Dashboard** | `staffing` | `/staffing` | `staffing_snapshots` (021) |
| **F5 Staff Predictor** | `predictions` | `/predictions`, `/settings/role-salaries` | `role_salary_configs`, `staff_predictions` (022) |
| **F6 Transfer Recommendations** | `transfer-recommendations` | card on `/staffing` → deep-links `/allocation` | `transfer_recommendations` (022) |

## Architecture notes (F10/F11)
- **Pure calculation cores** — `staffing-engine.ts`, `prediction-strategy.ts`, `transfer-matcher.ts`,
  `document-rules.ts`, `ratio-diff.ts`, `file-signature.ts` — no DB/Nest, deterministic,
  unit-tested (58 tests incl. the Edge-Case Gauntlet).
- **Pluggable strategies** — `PredictionStrategy` (v1 `RatioBasedStrategy`) and the transfer
  `TransferScorer` chain (v1 `RoleIdentityScorer`) let smarter formulas slot in without touching
  API/UI.
- **No N+1** — the staffing engine fetches all inputs in ~11 batched grouped queries; the company
  dashboard is one batched call. Snapshots (`@Cron` 01:30 IST) persist history for trends.
- **3-tier ratio resolution** — `staff_requirement_configurations` (outlet×role) → `ratio_templates`
  (category×role) → `staffing_ratios` (company category default).
- **Security/DPDP** — document bytes AES-256-GCM encrypted (Supabase Storage or encrypted-in-DB),
  numbers masked + reveal-gated + audited, magic-byte upload validation, short-lived signed URLs,
  immutable `document_access_logs`.
- **IST everywhere** — all "today" logic + daily jobs run in Asia/Kolkata.
- **No hardcoded business numbers** — ratios, thresholds (`t_excess`/`t_minor`), pax basis,
  salaries, upload size, signed-URL TTL all live in config tables editable by HR.

## Go-live runbook (human-ops — the code can't do these)

1. **Apply migrations in order** (hand-applied; no runner): `013`→`018` (pre-existing, still
   pending) then **`019`→`023`**. Each ships a `_ROLLBACK.sql`.
2. **Document encryption** — set `DOCUMENT_ENCRYPTION_KEY` (32 bytes hex/base64). Without it,
   document bytes/numbers store **unencrypted** (dev only). Optionally `DOCUMENT_SIGN_SECRET`.
3. **Document storage** — create a private Supabase Storage bucket `staff-documents` and set
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (else encrypted-in-DB fallback). See `.env.example`.
4. **Tune the model** — on the outlet pages set capacity + per-role ratios (or Prefill from a
   category template); zero Bar/Support for dine-in. Enter role averages at `/settings/role-salaries`.
   Adjust `t_excess`/`t_minor` if desired.
5. **Let the crons run** — document expiry (01:15 IST) and staffing snapshots (01:30 IST) populate
   status + trend history over subsequent days.
6. **RBAC** — new permission keys (`documents:reveal`, `documents:status`, `staffing:ratios`,
   `predictions:run`) are seeded to admin/hr/(managers) by the migrations; adjust on the Account
   Types page.

## Verified
`pnpm typecheck` (api + web) · `pnpm lint` (0 errors) · `pnpm test` (58 pass) · `pnpm build` — all
green. Migrations `019`–`023` written with rollbacks. **End-to-end verification requires the
migrations applied to a database** (they are not yet applied to live, which is still at `012`).
