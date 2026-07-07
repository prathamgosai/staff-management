-- 015_kiosk_clock_in.sql
-- Kiosk clock-in mode: a shared tablet physically at an outlet where staff clock
-- in/out with their Employee ID + a personal PIN. The device authenticates with a
-- long-lived bearer "device token" (NOT a user JWT), so no staff login is needed —
-- this covers the ~115 active staff who have no user account.
--
--   * kiosk_devices        — one row per enrolled device, bound to a single outlet.
--                            token_hash = SHA-256 of the raw token (shown once on
--                            creation); revoked_at kills a lost/stolen device.
--   * staff.kiosk_pin_hash — bcrypt hash of the staff member's numeric PIN (NULL =
--                            not enrolled for the kiosk yet).
--   * attendance.source    — where a record originated ('web' default, 'kiosk' from
--                            a kiosk device), so kiosk punches are auditable.

-- New clock method value. Added OUTSIDE the transaction block below because
-- PostgreSQL forbids using a freshly-added enum value in the same transaction;
-- ADD VALUE ... IF NOT EXISTS makes this idempotent (Postgres 12+).
ALTER TYPE clock_method ADD VALUE IF NOT EXISTS 'kiosk';

BEGIN;

-- Enrolled kiosk devices. A device is authenticated by a bearer token whose
-- SHA-256 digest is stored here; the raw token is displayed to the manager once
-- at creation and never persisted in the clear.
CREATE TABLE IF NOT EXISTS kiosk_devices (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id    UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    label        VARCHAR(120) NOT NULL,
    token_hash   TEXT NOT NULL,
    created_by   UUID REFERENCES users(id),
    last_seen_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Token lookups only ever consider live devices; outlet lookups list a manager's devices.
CREATE INDEX IF NOT EXISTS idx_kiosk_devices_token  ON kiosk_devices (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kiosk_devices_outlet ON kiosk_devices (outlet_id);

-- Per-staff numeric PIN (bcrypt). NULL = the staff member can't use the kiosk yet.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS kiosk_pin_hash TEXT;

-- Origin of an attendance record. Defaults to 'web' for every existing row.
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'web';

COMMIT;
