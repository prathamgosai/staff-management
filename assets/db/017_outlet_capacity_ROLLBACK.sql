-- 017_outlet_capacity_ROLLBACK.sql
-- Reverses 017_outlet_capacity.sql: drops the ratios + post-category map tables and the
-- outlet capacity columns (which also discards the seeded/edited capacity values).
BEGIN;

DROP TABLE IF EXISTS staffing_ratios;
DROP TABLE IF EXISTS post_category_map;

ALTER TABLE outlets DROP COLUMN IF EXISTS max_pax;
ALTER TABLE outlets DROP COLUMN IF EXISTS total_tables;

COMMIT;
