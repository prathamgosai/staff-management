-- 022_predictor_transfers_ROLLBACK.sql
-- Reverses 022. Drops predictor + transfer-recommendation tables and the predictions:run grants.
BEGIN;
DELETE FROM role_permissions WHERE permission = 'predictions:run';
DROP TABLE IF EXISTS transfer_recommendations;
DROP TABLE IF EXISTS staff_predictions;
DROP TABLE IF EXISTS role_salary_configs;
COMMIT;
