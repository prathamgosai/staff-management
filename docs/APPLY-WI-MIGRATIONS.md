# Apply & verify — Workforce Intelligence migrations (013 → 023)

A focused, copy-paste checklist to take the live DB from its current state (**applied through
`012`**) to the full Workforce Intelligence extension. Migrations are **hand-applied** (no
runner) via the **Supabase SQL editor** or `psql`, **one file at a time, in order**. Every file
has a matching `*_ROLLBACK.sql`.

> Run each file's full contents. Don't concatenate them into a single transaction — several are
> independent units, and `015` deliberately runs an `ALTER TYPE … ADD VALUE` **outside** its
> `BEGIN/COMMIT` (Postgres can't use a new enum value in the same transaction).

## 0. Prerequisite — the pending pre-WI migrations (013–018)
These were written earlier and are also still pending. Apply first, in order:

| File | What |
|---|---|
| `013_force_password_reset.sql` | `users.password_updated_at` + forced reset |
| `014_backfill_employee_outlets.sql` | backfill `users.outlet_ids` |
| `015_kiosk_clock_in.sql` | kiosk devices + PIN + attendance source — **run the whole file** (enum add is outside the txn) |
| `016_staff_documents.sql` | base staff-document vault (019 extends it) |
| `017_outlet_capacity.sql` | `outlets.total_tables/max_pax`, `post_category_map`, `staffing_ratios` |
| `018_tenant_settings.sql` | `tenant_settings` KV (seeds `covers_per_on_duty_staff`) |

## 1. Apply the WI migrations (019–023), in order

| File | Adds |
|---|---|
| `019_documents_domain.sql` | `document_types` (14 seeded), extends `staff_documents`, `staff_document_versions`, `document_access_logs`, perms `documents:reveal`/`documents:status` |
| `020_restaurant_config_ratios.sql` | `restaurant_categories` (7), `restaurant_configurations`, `staff_requirement_configurations` (+history), `ratio_templates`, perm `staffing:ratios` |
| `021_staffing_snapshots.sql` | `staffing_snapshots`, seeds `t_excess`/`t_minor` |
| `022_predictor_transfers.sql` | `role_salary_configs`, `staff_predictions`, `transfer_recommendations`, perm `predictions:run` |
| `023_wi_seed_and_perf.sql` | seeds configs + salaries (demo) + engine indexes |

## 2. Verify (run after 023 — all should return the expected counts)

```sql
-- New tables exist (each returns a non-null regclass)
SELECT to_regclass('public.document_types')                 AS document_types,
       to_regclass('public.staff_document_versions')        AS versions,
       to_regclass('public.document_access_logs')           AS access_logs,
       to_regclass('public.restaurant_categories')          AS categories,
       to_regclass('public.restaurant_configurations')      AS restaurant_config,
       to_regclass('public.staff_requirement_configurations') AS role_ratios,
       to_regclass('public.ratio_templates')                AS templates,
       to_regclass('public.staffing_snapshots')             AS snapshots,
       to_regclass('public.role_salary_configs')            AS salaries,
       to_regclass('public.staff_predictions')              AS predictions,
       to_regclass('public.transfer_recommendations')       AS transfer_recs;

-- staff_documents got the new columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'staff_documents'
  AND column_name IN ('document_type_id','status','current_version','doc_number_encrypted',
                      'storage_key','content_encrypted','deleted_at');   -- expect 7 rows

-- Seeds (per tenant)
SELECT (SELECT count(*) FROM document_types)        AS doc_types,        -- 14 / tenant
       (SELECT count(*) FROM restaurant_categories) AS categories,       -- 7 / tenant
       (SELECT count(*) FROM restaurant_configurations) AS configs,      -- ~6 (dine-in outlets)
       (SELECT count(*) FROM role_salary_configs)   AS salaries;         -- ~13 (active positions)

-- Engine thresholds
SELECT key, value FROM tenant_settings WHERE key IN ('t_excess','t_minor');  -- 1 and 0.15

-- New permissions seeded to the right roles
SELECT permission, string_agg(role::text, ',' ORDER BY role) AS roles
FROM role_permissions
WHERE permission IN ('documents:reveal','documents:status','staffing:ratios','predictions:run')
GROUP BY permission ORDER BY permission;
-- expect: documents:reveal=admin,hr | documents:status=admin,chef,head_of_house,hr
--         staffing:ratios=admin,head_of_house,hr | predictions:run=admin,head_of_house,hr
```

## 3. Environment (API service)

```bash
# 32-byte document encryption key (REQUIRED in prod — else documents store UNENCRYPTED)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # → DOCUMENT_ENCRYPTION_KEY
# optional dedicated signed-URL secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" # → DOCUMENT_SIGN_SECRET
```
Then set on the API service (see `.env.example` for the full block):
- `DOCUMENT_ENCRYPTION_KEY` (+ optional `DOCUMENT_SIGN_SECRET`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DOCUMENTS_BUCKET=staff-documents`
  — create a **private** bucket named `staff-documents` in Supabase Storage first. (Omit these
  and document bytes fall back to encrypted-in-DB.)

## 4. Smoke test (after redeploy / restart)
- Log in as admin → **Company staffing** (`/staffing`) renders KPIs; outlets show real numbers
  (not ⚪ *Not set up*) because 023 seeded configs.
- **Staff predictor** (`/predictions`) → run with 350 daily pax → non-zero payroll (023 seeded salaries).
- Open a staff profile → **Documents** → upload a PDF → preview → replace → version history shows v1 & v2.
- **Regenerate** transfer recommendations on `/staffing`.

## 5. Rollback
Apply the matching `*_ROLLBACK.sql` in **reverse** order (`023`→`019`). Note: rolling back `019`
drops document tables (any uploaded bytes/versions are lost); Storage objects must be pruned
out-of-band.
