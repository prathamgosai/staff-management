-- 015_kiosk_clock_in_ROLLBACK.sql
-- Reverses 015_kiosk_clock_in.sql.
BEGIN;

ALTER TABLE attendance_records DROP COLUMN IF EXISTS source;
ALTER TABLE staff              DROP COLUMN IF EXISTS kiosk_pin_hash;
DROP TABLE IF EXISTS kiosk_devices;

COMMIT;

-- NOTE: the 'kiosk' value added to the clock_method enum is intentionally NOT
-- removed — PostgreSQL cannot drop an enum value, and leaving it is harmless.
