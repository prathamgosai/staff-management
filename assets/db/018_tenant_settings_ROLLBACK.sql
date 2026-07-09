-- 018_tenant_settings_ROLLBACK.sql
-- Reverses 018_tenant_settings.sql.
BEGIN;

DROP TABLE IF EXISTS tenant_settings;

COMMIT;
