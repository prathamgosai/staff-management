-- 026_late_grace_minutes.sql
-- Adds the `late_grace_minutes` tuning knob to tenant_settings: minutes past a shift's
-- rostered start before a clock-in is labelled 'late'. Consumed by resolveLateness()
-- (apps/api/src/common/utils/lateness.util.ts), shared by the attendance and kiosk
-- punch paths. Default 10; edit per tenant to tighten or loosen the policy.
--
-- Context: attendance_records.late_minutes and the 'late' attendance_status shipped in
-- 001 but no code ever wrote them, so the reports page's "Late Days" column has always
-- read 0. This migration supplies the policy input that fix needs.
--
-- Data already recorded stays untouched: historical rows keep status 'present', because
-- their true arrival-vs-roster delta was never captured and cannot be reconstructed.
-- Late counts are therefore correct only from this point forward.
-- Transactional; idempotent; ships a matching _ROLLBACK.
BEGIN;

INSERT INTO tenant_settings (tenant_id, key, value)
SELECT id, 'late_grace_minutes', 10
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

COMMIT;
