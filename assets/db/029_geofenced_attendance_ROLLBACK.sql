-- 029_geofenced_attendance_ROLLBACK.sql
-- Reverses 029. Destructive: outlet coordinates your managers entered are dropped, as are
-- the geofence verdicts on existing punches. Export coordinates first if you want them back:
--   \copy (SELECT id, name, latitude, longitude, geofence_radius_m FROM outlets WHERE latitude IS NOT NULL) TO 'outlet_coords.csv' CSV HEADER
BEGIN;

DROP INDEX IF EXISTS attendance_geo_pending_idx;

ALTER TABLE attendance_records DROP COLUMN IF EXISTS geo_reviewed_at;
ALTER TABLE attendance_records DROP COLUMN IF EXISTS geo_reviewed_by;
ALTER TABLE attendance_records DROP COLUMN IF EXISTS geo_accuracy_m;
ALTER TABLE attendance_records DROP COLUMN IF EXISTS geo_distance_m;
ALTER TABLE attendance_records DROP COLUMN IF EXISTS geo_reason;
ALTER TABLE attendance_records DROP COLUMN IF EXISTS geo_status;
DROP TYPE IF EXISTS attendance_geo_status;

ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_coords_both_or_neither;
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_geofence_radius_sane;
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_longitude_range;
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_latitude_range;
ALTER TABLE outlets DROP COLUMN IF EXISTS location_set_at;
ALTER TABLE outlets DROP COLUMN IF EXISTS location_set_by;
ALTER TABLE outlets DROP COLUMN IF EXISTS geofence_radius_m;
ALTER TABLE outlets DROP COLUMN IF EXISTS longitude;
ALTER TABLE outlets DROP COLUMN IF EXISTS latitude;

DELETE FROM tenant_settings WHERE key = 'gps_max_accuracy_m';

COMMIT;
