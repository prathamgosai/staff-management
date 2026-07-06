-- 012_notifications.sql
-- Automatic, role-based notification system (in-app bell + WhatsApp + email).
-- Adds:
--   • notifications            — one in-app row per recipient user, with read tracking
--   • notification_preferences — REPLACES the legacy staff-keyed prefs (unused
--                                001_schema scaffold) with simple per-user channel toggles
--   • roster_publications      — records an outlet's week roster being published; the
--                                draft->publish gate and the ROSTER_PUBLISHED dedupe key
-- The legacy notification_logs / notification_templates tables are left INTACT — the
-- old template-driven delivery path still uses them.
-- All DDL is transactional in PostgreSQL, so a failure rolls back cleanly.
BEGIN;

-- ── In-app notifications (one row per recipient user) ─────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    type          VARCHAR(50)  NOT NULL,          -- NotificationEvent value
    title         VARCHAR(300) NOT NULL,
    body          TEXT         NOT NULL,
    data          JSONB        NOT NULL DEFAULT '{}',   -- event payload for deep-linking
    channels_sent JSONB        NOT NULL DEFAULT '[]',   -- ["in_app","whatsapp",...]
    read_at       TIMESTAMPTZ,                          -- NULL = unread
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Bell + unread-count read by (user, read_at); history reads newest-first per tenant.
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created
    ON notifications (tenant_id, created_at DESC);

-- ── Per-user channel preferences (replaces the legacy staff-keyed table) ──────
-- The old notification_preferences (staff_id, channel, event_type, enabled) from
-- 001_schema was scaffold only and never wired to any UI. The new system uses three
-- simple per-user channel switches, honoured by the Bull processor before each send.
DROP TABLE IF EXISTS notification_preferences;

CREATE TABLE notification_preferences (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    in_app_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Roster publications (draft -> published gate) ─────────────────────────────
-- One row per (outlet, week) publish. The UNIQUE key makes "publish week"
-- idempotent and lets emit points ask "is this week published?" cheaply, so a
-- SHIFT_CHANGED never fires for a draft week. week_key is the local-Monday week
-- key as YYYY-MM-DD text (matches the frontend/backend getMonday invariant; stored
-- as text to dodge the DATE/timezone parse shift noted elsewhere in the codebase).
CREATE TABLE IF NOT EXISTS roster_publications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id     UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    week_key      TEXT NOT NULL,
    published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_by  UUID REFERENCES users(id),
    UNIQUE (tenant_id, outlet_id, week_key)   -- also serves the "is week published?" lookup
);

COMMIT;
