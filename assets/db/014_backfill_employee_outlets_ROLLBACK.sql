-- 014_backfill_employee_outlets_ROLLBACK.sql
-- Best-effort reverse of the backfill: re-empty outlet_ids only where it STILL exactly
-- equals [the linked staff's current outlet] (i.e. looks untouched since the backfill).
-- Manual / multi-outlet assignments made afterwards are left intact.
BEGIN;

UPDATE users u
   SET outlet_ids = '{}',
       updated_at = NOW()
  FROM staff s
 WHERE s.user_id = u.id
   AND u.outlet_ids = ARRAY[s.current_outlet_id];

COMMIT;
