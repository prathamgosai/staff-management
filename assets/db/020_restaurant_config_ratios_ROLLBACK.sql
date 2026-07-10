-- 020_restaurant_config_ratios_ROLLBACK.sql
-- Reverses 020. Drops the config/ratio/template/category tables and the staffing:ratios grants.
-- Any saved restaurant configs, per-role ratios, change history and templates are lost.
BEGIN;

DELETE FROM role_permissions WHERE permission = 'staffing:ratios';

DROP TABLE IF EXISTS ratio_templates;
DROP TABLE IF EXISTS staff_requirement_config_history;
DROP TABLE IF EXISTS staff_requirement_configurations;
DROP TABLE IF EXISTS restaurant_configurations;
DROP TABLE IF EXISTS restaurant_categories;

COMMIT;
