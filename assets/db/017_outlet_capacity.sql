-- 017_outlet_capacity.sql
-- Outlet capacity model — the inputs for the required-vs-actual staffing analysis
-- (Tasks 3–5, 7). Adds table/pax capacity to dine-in outlets, a post→category map, and
-- tunable per-category staffing ratios.
--
--   • outlets.total_tables / max_pax — NULL means "not a dine-in outlet / excluded from the
--     capacity model" (bakeries, kitchens, ODC, etc. keep NULL).
--   • post_category_map(tenant_id, post, category) — seeded from the ACTUAL 13 positions in
--     this DB (positions.name). The spec's imagined posts (Pizza/WOK/Sushi Chef, Pass, Sides,
--     Barista, Guest Relations, Watchman…) do NOT exist here, so the map is built from the real
--     taxonomy. Lookup is case-insensitive in code; unmapped/NULL posts resolve to 'General'.
--   • staffing_ratios(tenant_id, category, pax_per_staff, min_staff) — seeded with the spec's
--     calibrated defaults; admins tune them in the UI. NOTE: this group has NO Bar/Barista
--     position, so the 'Bar' category has 0 actual staff — its ratio is a placeholder to zero
--     out or retune once drinks roles are tagged.
--   • Seeds the 6 dine-in outlets' capacity BY CODE (stable id), guarded on max_pax IS NULL so a
--     re-run — or a later admin edit — is never clobbered. VERIFY comment precedes the block.
--
-- Reuses existing permissions (NO new key): read surfaces gate on allocation:read (already held
-- by admin/hr/head_of_house); ratio edits gate on roles:manage (same as /account-types).
-- Transactional; idempotent; ships a matching _ROLLBACK.
BEGIN;

-- ── Outlet capacity columns ───────────────────────────────────────────────────
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS total_tables INTEGER;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS max_pax      INTEGER;

-- ── Post → category map ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_category_map (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    post      TEXT NOT NULL,
    category  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, post)
);

INSERT INTO post_category_map (tenant_id, post, category)
SELECT t.id, x.post, x.category
FROM tenants t
CROSS JOIN (VALUES
    ('Head Chef',           'Kitchen'),
    ('Chef de Partie',      'Kitchen'),
    ('Cook',                'Kitchen'),
    ('Kitchen Helper',      'Kitchen'),
    ('Kitchen Prep Staff',  'Kitchen'),
    ('R&D Chef',            'Kitchen'),
    ('Service Crew',        'Service'),
    ('Senior Service Crew', 'Service'),
    ('Cashier',             'Service'),
    ('Part-Time Crew',      'Service'),
    ('Outlet Manager',      'Management'),
    ('Assistant Manager',   'Management'),
    ('ODC Staff',           'Support')
) AS x(post, category)
ON CONFLICT (tenant_id, post) DO NOTHING;

-- ── Per-category staffing ratios ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staffing_ratios (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category      TEXT NOT NULL,
    pax_per_staff NUMERIC(6,2) NOT NULL,
    min_staff     INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, category)
);

INSERT INTO staffing_ratios (tenant_id, category, pax_per_staff, min_staff)
SELECT t.id, x.category, x.pax_per_staff, x.min_staff
FROM tenants t
CROSS JOIN (VALUES
    ('Kitchen',      8.8,   4),
    ('Service',     16.6,   2),
    ('Bar',         28.0,   1),
    ('Management', 113.0,   1),
    ('Support',     15.6,   2),
    ('General',     28.0,   0)
) AS x(category, pax_per_staff, min_staff)
ON CONFLICT (tenant_id, category) DO NOTHING;

-- ── Seed the 6 dine-in outlets' capacity (owner-provided, cross-checked to floor plans) ──
-- VERIFY: SELECT id, code, name FROM outlets WHERE code IN ('CAP-PIL','CAP-VES','CAP-AMB','CAP-UNI','AIK-SUR','AIK-AHM');
-- Guarded on max_pax IS NULL: a re-run, or any later admin capacity edit, is preserved.
UPDATE outlets SET total_tables = 13, max_pax =  72 WHERE code = 'CAP-PIL' AND max_pax IS NULL; -- Capiche Piplod
UPDATE outlets SET total_tables = 17, max_pax =  91 WHERE code = 'CAP-VES' AND max_pax IS NULL; -- Capiche Vesu
UPDATE outlets SET total_tables = 19, max_pax = 106 WHERE code = 'CAP-AMB' AND max_pax IS NULL; -- Capiche Ambli
UPDATE outlets SET total_tables = 22, max_pax = 116 WHERE code = 'CAP-UNI' AND max_pax IS NULL; -- Capiche Uni
UPDATE outlets SET total_tables = 15, max_pax =  81 WHERE code = 'AIK-SUR' AND max_pax IS NULL; -- Aiko Surat (spec "Aiko Pal")
UPDATE outlets SET total_tables = 20, max_pax =  97 WHERE code = 'AIK-AHM' AND max_pax IS NULL; -- Aiko Ahmedabad (spec "Aiko Ambli")

COMMIT;
