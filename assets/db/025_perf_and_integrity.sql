-- 025_perf_and_integrity.sql
-- Performance + data-integrity hardening pass (from the adversarially-verified
-- improvement roadmap). Three groups, all idempotent and non-destructive:
--
--   1. HOT-PATH INDEXES
--      • Login resolves an identifier against lower(users.email) / lower(staff.employee_id)
--        and an optional '@workforceiq.app' suffix (see auth.service.ts). With no functional
--        index those predicates sequential-scan the two largest tables on every sign-in —
--        the single hottest cross-region (Sydney) round-trip. Add matching functional indexes.
--      • refresh_tokens is looked up by token_hash on every refresh and grows unbounded;
--        it had no index on token_hash (or user_id, used by revoke-all). Add both.
--
--   2. DIVISOR CHECK CONSTRAINTS
--      Every staffing/ratio table divides pax (or covers) BY an admin-editable number.
--      A 0 yields Math.ceil(x/0) = Infinity and silently corrupts the whole staffing
--      dashboard. Enforce > 0 at the DB. Added NOT VALID so a legacy bad row can't fail the
--      migration; the constraint still enforces on every future INSERT/UPDATE. The app layer
--      guards too (capacity.service.ts) — defence in depth.
--
--   3. OUT-OF-BAND COLUMN RECONCILIATION
--      users.pending_approval and users.ticket_number exist in the live DB but were added
--      out-of-band (no migration). A fresh rebuild diverges, and migration 007 — which sets
--      pending_approval — would fail. 001_schema.sql now declares them on the base table for
--      fresh builds; this ADD COLUMN IF NOT EXISTS reconciles any DB built from the old 001.
--      No-op on the live DB (columns already present).
--
-- Transactional; idempotent; re-runnable. Ships a matching _ROLLBACK.
BEGIN;

-- ── 1. Hot-path indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_lower_email        ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_staff_lower_employee_id  ON staff (lower(employee_id));
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user       ON refresh_tokens (user_id);
-- Audit trail is read newest-first per tenant (GET /audit).
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created      ON audit_logs (tenant_id, created_at DESC);

-- ── 2. Divisor CHECK constraints (idempotent via pg_constraint guard) ──────────
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
      -- tenant_settings is a generic key/value store; only guard the divisor key.
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

-- ── 3. Out-of-band column reconciliation (no-op on the live DB) ────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ticket_number    TEXT;

COMMIT;
