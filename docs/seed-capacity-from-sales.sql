-- seed-capacity-from-sales.sql
-- Seeds each outlet's capacity (avg/peak pax) from the May + June 2026 "All Restaurant Report:
-- Day Wise" sales reports, converted to covers at an assumed AVG CHECK of ₹600 net-sales/cover.
--   avg_pax  = (2-month avg daily net sales) / 600
--   peak_pax = avg_pax * 1.7  (a stable busy-day peak, not the single catering-day outlier)
-- >>> CHANGE 600 to your real average spend per cover, and re-derive, for accurate numbers. <<<
--
-- Prereqs: migrations 017 (outlet capacity) + 020 (restaurant_configurations) applied.
-- Matches outlets by NAME — confirm the two Ahmedabad Capiche patterns map to YOUR outlet names
-- (e.g. Capiche Ambli / Capiche Uni). Run in the Supabase SQL editor.
BEGIN;

-- 1) Capacity (tables/max pax) on the outlet row (migration 017 columns).
UPDATE outlets o SET max_pax = v.peak_pax, total_tables = GREATEST(1, ROUND(v.peak_pax / 5.3))
FROM (VALUES
  ('%aiko%ahmedabad%',   487),
  ('%aiko%surat%',       376),
  ('%capiche%piplod%',   382),
  ('%capiche%vesu%',     470)
  -- add your two Ahmedabad Capiche outlets here once names are confirmed:
  -- ('%capiche%<ambli-or-name>%', 787), ('%capiche%<uni-or-2.0>%', 405)
) AS v(pattern, peak_pax)
WHERE o.name ILIKE v.pattern AND o.is_active;

-- 2) restaurant_configurations avg/peak pax (migration 020) — drives Predicted PAX + staffing.
INSERT INTO restaurant_configurations (tenant_id, outlet_id, avg_daily_pax, peak_pax, dinner_capacity, lunch_capacity)
SELECT o.tenant_id, o.id, v.avg_pax, v.peak_pax, v.peak_pax, ROUND(v.peak_pax * 0.45)
FROM outlets o
JOIN (VALUES
  ('%aiko%ahmedabad%',   220, 374),
  ('%aiko%surat%',       210, 357),
  ('%capiche%piplod%',   179, 304),
  ('%capiche%vesu%',     232, 394)
  -- ('%capiche%<ambli>%',  351, 597), ('%capiche%<uni/2.0>%', 173, 294)
) AS v(pattern, avg_pax, peak_pax) ON o.name ILIKE v.pattern
WHERE o.is_active
ON CONFLICT (outlet_id) DO UPDATE SET
  avg_daily_pax = EXCLUDED.avg_daily_pax, peak_pax = EXCLUDED.peak_pax,
  dinner_capacity = EXCLUDED.dinner_capacity, lunch_capacity = EXCLUDED.lunch_capacity;

COMMIT;

-- After this, set per-role staffing ratios on each outlet page (or Prefill from a category
-- template), and the dashboard PAX card + Company Staffing + Predictor all show live numbers.
-- For the LEARNING day-of-week forecast, additionally import the daily covers via
-- Settings → Import pax history (CSV of Date | Outlet | Net Sales, tick "derive covers from
-- revenue", avg spend 600) — that feeds the recency-weighted forecast in the scheduling strip.
