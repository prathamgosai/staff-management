-- 027_position_sops_kpis_ROLLBACK.sql
-- Drops the role-level SOP/KPI tables. Destructive: any SOPs or KPIs your managers have
-- authored are lost. Export them first if they have been edited away from the seeded draft:
--   \copy (SELECT * FROM position_sops WHERE deleted_at IS NULL) TO 'sops.csv' CSV HEADER
--   \copy (SELECT * FROM position_kpis WHERE deleted_at IS NULL) TO 'kpis.csv' CSV HEADER
BEGIN;

DROP TABLE IF EXISTS position_kpis;
DROP TABLE IF EXISTS position_sops;

COMMIT;
