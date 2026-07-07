-- 014_backfill_employee_outlets.sql
-- Fail-closed outlet scoping hides everything from users whose users.outlet_ids is
-- empty. Backfill each account's outlet from its linked staff row
-- (staff.user_id = users.id) so employees / chefs / heads see their own outlet's
-- published roster, attendance and leave instead of a blank app.
--
--   • Only fills EMPTY outlet_ids — never overwrites a manual assignment.
--   • staff.current_outlet_id is NOT NULL, so a linked staff row always has one.
--   • Admin / HR / super_admin resolve to "all outlets" regardless of this column;
--     a linked one is filled harmlessly.
-- Transactional; ships a matching _ROLLBACK.
BEGIN;

UPDATE users u
   SET outlet_ids = ARRAY[s.current_outlet_id],
       updated_at = NOW()
  FROM staff s
 WHERE s.user_id = u.id
   AND s.current_outlet_id IS NOT NULL
   AND (u.outlet_ids IS NULL OR u.outlet_ids = '{}');

COMMIT;
