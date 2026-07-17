-- 030_calibrate_ratio_templates.sql
-- Calibrates per-category staffing ratios FROM ACTUAL CURRENT STAFFING.
--
-- Why this exists: ratio_templates was empty, so every restaurant category fell back to the
-- company defaults. All 7 categories returned an identical prediction (67 staff at 200 pax),
-- and because the fallback emits synthetic "Kitchen (company default)" roles rather than real
-- positions, no role salary could attach — monthly payroll was permanently 0 and the
-- predictor's whole cost half was dead. The category dropdown was decoration.
--
-- The ratios are DERIVED, not invented:
--   guests_per_staff = SUM(peak_pax of the category's outlets) / (staff currently in that role)
--   min_staff        = the smallest headcount that role currently has at any one outlet
-- So the predictor reproduces roughly what these restaurants actually run today, and can then
-- be tuned. Anchoring to real staffing is the only defensible starting point: there is no
-- attendance history (1 row) or sales data to fit anything better against.
--
-- Only the 6 outlets with a category + peak_pax in restaurant_configurations contribute
-- (Asian: Aiko x2, Casual Dining: Capiche x4). Uncalibrated categories keep using the company
-- defaults, which is the honest behaviour — we have no outlets of those types to learn from.
--
-- KNOWN WART: 'Outlet Manager' exists as TWO duplicate position rows (35 staff and 7), so each
-- category gets two Outlet Manager templates and predictions will over-count managers by ~1.
-- Merging those position rows is a separate data decision; the ratios stay anchored to the
-- real headcount either way.
-- Transactional; idempotent; ships a matching _ROLLBACK.
BEGIN;

INSERT INTO ratio_templates (tenant_id, category_id, position_id, guests_per_staff, min_staff)
WITH cat_outlets AS (
  SELECT cfg.category_id, cfg.outlet_id, cfg.peak_pax
  FROM restaurant_configurations cfg
  WHERE cfg.category_id IS NOT NULL AND cfg.peak_pax > 0
),
cat_peak AS (
  SELECT category_id, SUM(peak_pax) AS total_peak
  FROM cat_outlets GROUP BY category_id
),
per_outlet AS (
  SELECT co.category_id, co.outlet_id, s.position_id, s.tenant_id, count(*) AS n
  FROM cat_outlets co
  JOIN staff s ON s.current_outlet_id = co.outlet_id
              AND s.employment_status = 'active'
              AND s.position_id IS NOT NULL
  GROUP BY 1, 2, 3, 4
),
rolled AS (
  SELECT category_id, position_id, tenant_id,
         SUM(n) AS staff_n,
         MIN(n) AS min_per_outlet   -- floor: what the leanest outlet already runs
  FROM per_outlet GROUP BY 1, 2, 3
)
SELECT r.tenant_id, r.category_id, r.position_id,
       ROUND(cp.total_peak::numeric / r.staff_n, 2) AS guests_per_staff,
       r.min_per_outlet
FROM rolled r
JOIN cat_peak cp ON cp.category_id = r.category_id
WHERE NOT EXISTS (
  -- Never overwrite a ratio someone has since tuned by hand.
  SELECT 1 FROM ratio_templates rt
   WHERE rt.category_id = r.category_id AND rt.position_id = r.position_id
);

COMMIT;
