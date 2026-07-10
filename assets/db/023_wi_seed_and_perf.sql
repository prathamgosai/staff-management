-- 023_wi_seed_and_perf.sql
-- Phase 5 — demo seed + performance indexes for the Workforce Intelligence extension.
--   • Seeds restaurant_configurations for every dine-in outlet (category by brand, capacities
--     derived from the existing max_pax/total_tables) so the staffing dashboard + predictor light
--     up on the real 6 outlets without hand-entry.
--   • Seeds role_salary_configs with plausible ₹ averages per role (by staff-category) so the
--     predictor shows payroll immediately. HR tunes both afterwards.
--   • Adds composite indexes for the engine's hot grouped queries.
--
-- ADDITIVE + idempotent (guarded / ON CONFLICT). Runs after 022. Seed values are DEMO defaults —
-- tune on the outlet pages + Role-salaries once real numbers are known.
BEGIN;

-- ── restaurant_configurations (per dine-in outlet) ───────────────────────────
INSERT INTO restaurant_configurations
  (tenant_id, outlet_id, category_id, area_sqft, kitchen_size_sqft, avg_daily_pax, peak_pax, lunch_capacity, dinner_capacity)
SELECT o.tenant_id, o.id, rc.id,
       COALESCE(o.total_tables, 20) * 100,                       -- ~100 sqft/table (demo)
       ROUND(COALESCE(o.total_tables, 20) * 100 * 0.22),         -- kitchen ~22% of floor
       ROUND(o.max_pax * 1.5),                                   -- ~1.5 turns/day
       o.max_pax,                                                -- peak
       ROUND(o.max_pax * 0.8),                                   -- lunch
       o.max_pax                                                 -- dinner (peak)
FROM outlets o
JOIN restaurant_categories rc
  ON rc.tenant_id = o.tenant_id
 AND rc.name = CASE WHEN o.name ILIKE '%aiko%' THEN 'Asian' ELSE 'Casual Dining' END
 AND rc.deleted_at IS NULL
WHERE o.is_active = true AND o.max_pax IS NOT NULL
ON CONFLICT (outlet_id) DO NOTHING;

-- ── role_salary_configs (₹ average per role, by staff-category) ──────────────
-- Fixed effective_from so the seed is idempotent; HR adds a newer effective-dated row to change.
INSERT INTO role_salary_configs (tenant_id, position_id, avg_monthly_salary, effective_from)
SELECT p.tenant_id, p.id,
       CASE COALESCE(pcm.category, 'General')
         WHEN 'Management' THEN 42000
         WHEN 'Kitchen'    THEN 22000
         WHEN 'Bar'        THEN 21000
         WHEN 'Service'    THEN 18000
         WHEN 'Support'    THEN 16000
         ELSE 15000
       END,
       DATE '2026-01-01'
FROM positions p
LEFT JOIN post_category_map pcm ON pcm.tenant_id = p.tenant_id AND LOWER(pcm.post) = LOWER(p.name)
WHERE p.is_active = true
ON CONFLICT (position_id, effective_from) WHERE deleted_at IS NULL DO NOTHING;

-- ── performance indexes for the engine's grouped reads ───────────────────────
-- current-staff-by-outlet-and-role (active only) — the engine's biggest grouped scan.
CREATE INDEX IF NOT EXISTS idx_staff_outlet_position_active
  ON staff (current_outlet_id, position_id) WHERE employment_status = 'active';
-- present-today lookups already covered by idx_attendance_outlet_date (001); add a status-aware one.
CREATE INDEX IF NOT EXISTS idx_attendance_outlet_date_status
  ON attendance_records (outlet_id, date, status);
-- approved leave overlapping a date, by staff.
CREATE INDEX IF NOT EXISTS idx_leave_status_dates
  ON leave_requests (status, start_date, end_date);
-- transfers effective on a date, by destination.
CREATE INDEX IF NOT EXISTS idx_transfers_to_effective
  ON staff_transfers (to_outlet_id, effective_date);

COMMIT;
