-- 029_geofenced_attendance.sql
-- Location-based attendance: outlet coordinates + a server-computed geofence verdict on
-- every punch.
--
-- Why new columns rather than reusing attendance_records.status: `status` already means
-- present|late|absent|on_leave — the *attendance* fact. The geofence verdict is a separate
-- axis (a punch can be present AND late AND outside the radius). Overloading one column
-- would destroy late tracking, which only started working today.
--
-- gps_clock_in / gps_clock_out (POINT) already existed in 001 and were never written —
-- clockIn accepted gpsLat/gpsLng and silently discarded them. This migration adds the
-- storage the decision needs; the service change starts populating all of it.
--
-- Coordinates are NOT seeded: nobody has surveyed these outlets. An invented coordinate is
-- worse than a null, because a null disables the geofence honestly while a wrong one
-- rejects real staff. Until an outlet has lat/lng, its punches record 'not_evaluated'.
-- Transactional; idempotent; ships a matching _ROLLBACK.
BEGIN;

-- ── Outlet location + per-outlet radius ──────────────────────────────────────
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS latitude          NUMERIC(9,6);
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS longitude         NUMERIC(9,6);
-- Per-outlet, not global: a mall unit needs a wider radius than a standalone cafe.
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER NOT NULL DEFAULT 150;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS location_set_by   UUID REFERENCES users(id);
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS location_set_at   TIMESTAMPTZ;

-- Guard rails: real coordinates only, and a radius that can't be set to something absurd.
-- A 0m radius would reject everyone; a 100km one would approve the whole city.
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_latitude_range;
ALTER TABLE outlets ADD CONSTRAINT outlets_latitude_range
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_longitude_range;
ALTER TABLE outlets ADD CONSTRAINT outlets_longitude_range
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_geofence_radius_sane;
ALTER TABLE outlets ADD CONSTRAINT outlets_geofence_radius_sane
  CHECK (geofence_radius_m BETWEEN 25 AND 2000);
-- Latitude without longitude is not a location.
ALTER TABLE outlets DROP CONSTRAINT IF EXISTS outlets_coords_both_or_neither;
ALTER TABLE outlets ADD CONSTRAINT outlets_coords_both_or_neither
  CHECK ((latitude IS NULL) = (longitude IS NULL));

-- ── Geofence verdict on the punch ────────────────────────────────────────────
-- 'not_evaluated' is the honest default and is NOT a failure: it covers kiosk punches
-- (the kiosk is on-site by definition, so its GPS proves nothing) and outlets whose
-- coordinates are not set yet. Rejecting those would break the working kiosk flow.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_geo_status') THEN
    CREATE TYPE attendance_geo_status AS ENUM ('approved','pending_review','rejected','not_evaluated');
  END IF;
END $$;

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS geo_status attendance_geo_status NOT NULL DEFAULT 'not_evaluated';
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS geo_reason TEXT;
-- Distance the server computed, in metres. Kept so a manager reviewing a flagged punch can
-- see "212m away" instead of re-deriving it, and so the radius can be re-tuned later.
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS geo_distance_m NUMERIC(10,2);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS geo_accuracy_m NUMERIC(10,2);
-- Who cleared a pending_review punch, and when.
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS geo_reviewed_by UUID REFERENCES users(id);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS geo_reviewed_at TIMESTAMPTZ;

-- The manager queue: punches awaiting a decision. Partial index — pending is a small
-- minority of rows and the only state anyone queries by.
CREATE INDEX IF NOT EXISTS attendance_geo_pending_idx
  ON attendance_records (outlet_id, date) WHERE geo_status = 'pending_review';

-- ── Accuracy policy ──────────────────────────────────────────────────────────
-- Per-tenant knob, matching late_grace_minutes (026). A punch whose GPS accuracy is worse
-- than this can't be trusted against a 150m radius, so it goes to review rather than being
-- approved on bad data. Kitchens have thick walls; indoor fixes are routinely 30-100m.
INSERT INTO tenant_settings (tenant_id, key, value)
SELECT id, 'gps_max_accuracy_m', 50 FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

COMMIT;
