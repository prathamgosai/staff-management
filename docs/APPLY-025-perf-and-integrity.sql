-- APPLY-025-perf-and-integrity.sql
-- Run this ONCE in the Supabase SQL Editor. It is the same content as
-- assets/db/025_perf_and_integrity.sql, safe to run more than once.
--
-- What it does:
--   1. Adds functional indexes on lower(users.email) / lower(staff.employee_id) and on
--      refresh_tokens(token_hash, user_id) — speeds up the hottest cross-region query (login).
--   2. Adds > 0 CHECK constraints (NOT VALID) to every staffing/ratio divisor column so a
--      0 can never again produce Infinity in the staffing dashboard.
--   3. Reconciles the out-of-band users.pending_approval / ticket_number columns (no-op here
--      since the live DB already has them; matters only for fresh rebuilds).

BEGIN;

CREATE INDEX IF NOT EXISTS idx_users_lower_email        ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_staff_lower_employee_id  ON staff (lower(employee_id));
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user       ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created      ON audit_logs (tenant_id, created_at DESC);

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('staffing_ratios',                   'chk_staffing_ratios_pax_pos',   'pax_per_staff > 0'),
      ('labor_ratio_configs',               'chk_labor_ratio_pax_pos',       'pax_per_staff > 0'),
      ('staff_requirement_configurations',  'chk_srq_guests_pos',            'guests_per_staff > 0'),
      ('ratio_templates',                   'chk_ratio_tpl_guests_pos',      'guests_per_staff > 0'),
      ('tenant_settings',                   'chk_tenant_settings_divisor_pos',
         'key <> ''covers_per_on_duty_staff'' OR value > 0')
    ) AS v(tbl, cname, expr)
  LOOP
    IF to_regclass(c.tbl) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.cname)
    THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', c.tbl, c.cname, c.expr);
    END IF;
  END LOOP;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ticket_number    TEXT;

COMMIT;

-- ── verify ───────────────────────────────────────────────────────────────────
-- Expect the four idx_* rows present:
SELECT indexname FROM pg_indexes
 WHERE indexname IN ('idx_users_lower_email','idx_staff_lower_employee_id',
                     'idx_refresh_tokens_token_hash','idx_refresh_tokens_user')
 ORDER BY indexname;
-- Expect the five chk_* constraints present:
SELECT conname FROM pg_constraint
 WHERE conname LIKE 'chk_%_pos' OR conname = 'chk_tenant_settings_divisor_pos'
 ORDER BY conname;
