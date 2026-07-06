-- 012_notifications_ROLLBACK.sql
-- Reverses 012_notifications.sql. Drops the three new tables and restores the
-- original staff-keyed notification_preferences exactly as defined in 001_schema.sql.
BEGIN;

DROP TABLE IF EXISTS roster_publications;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_preferences;

-- Restore the original scaffold table (staff-keyed, per channel + event).
CREATE TABLE notification_preferences (
    staff_id      UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    channel       notif_channel NOT NULL,
    event_type    VARCHAR(50) NOT NULL,
    enabled       BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (staff_id, channel, event_type)
);

COMMIT;
