-- ============================================================
-- WorkforceIQ — Seed Data (Development / Demo)
-- ============================================================

-- ── Tenant ───────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug, country, timezone, currency) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Restaurant Group', 'demo-rg', 'MY', 'Asia/Kuala_Lumpur', 'MYR');

-- ── Brands ───────────────────────────────────────────────────
INSERT INTO brands (id, tenant_id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Noodle House'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Burger Co'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Sushi Bar');

-- ── Outlets ───────────────────────────────────────────────────
INSERT INTO outlets (id, tenant_id, brand_id, code, name, type, address, contact, seating_capacity, operating_hours) VALUES
  ('20000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'NH-KL01', 'Noodle House KL Sentral', 'dine_in',
   '{"line1":"L2-15, KL Sentral","city":"Kuala Lumpur","state":"WP","postalCode":"50470","country":"MY"}',
   '{"phone":"+60312345678","email":"klsentral@noodlehouse.my"}',
   120,
   '[{"dayOfWeek":"monday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"tuesday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"wednesday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"thursday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"friday","openTime":"10:00","closeTime":"23:00","isClosed":false},
     {"dayOfWeek":"saturday","openTime":"09:00","closeTime":"23:00","isClosed":false},
     {"dayOfWeek":"sunday","openTime":"09:00","closeTime":"22:00","isClosed":false}]'),
  ('20000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'NH-PJ01', 'Noodle House PJ SS2', 'dine_in',
   '{"line1":"No 12, Jalan SS2/55","city":"Petaling Jaya","state":"Selangor","postalCode":"47300","country":"MY"}',
   '{"phone":"+60378901234","email":"pjss2@noodlehouse.my"}',
   80,
   '[{"dayOfWeek":"monday","openTime":"11:00","closeTime":"21:00","isClosed":false},
     {"dayOfWeek":"tuesday","openTime":"11:00","closeTime":"21:00","isClosed":false},
     {"dayOfWeek":"wednesday","openTime":"11:00","closeTime":"21:00","isClosed":false},
     {"dayOfWeek":"thursday","openTime":"11:00","closeTime":"21:00","isClosed":false},
     {"dayOfWeek":"friday","openTime":"11:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"saturday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"sunday","openTime":"10:00","closeTime":"21:00","isClosed":false}]'),
  ('20000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   'BC-MV01', 'Burger Co Mid Valley', 'quick_service',
   '{"line1":"GF-12, Mid Valley Megamall","city":"Kuala Lumpur","state":"WP","postalCode":"59200","country":"MY"}',
   '{"phone":"+60322223333","email":"midvalley@burgerco.my"}',
   60,
   '[{"dayOfWeek":"monday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"tuesday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"wednesday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"thursday","openTime":"10:00","closeTime":"22:00","isClosed":false},
     {"dayOfWeek":"friday","openTime":"10:00","closeTime":"23:00","isClosed":false},
     {"dayOfWeek":"saturday","openTime":"09:30","closeTime":"23:00","isClosed":false},
     {"dayOfWeek":"sunday","openTime":"09:30","closeTime":"22:00","isClosed":false}]');

-- ── Departments ───────────────────────────────────────────────
INSERT INTO departments (id, outlet_id, name, sort_order) VALUES
  -- NH-KL01
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Kitchen', 1),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Floor Service', 2),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Cashier', 3),
  -- NH-PJ01
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'Kitchen', 1),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'Floor Service', 2),
  -- BC-MV01
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', 'Kitchen', 1),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 'Counter', 2);

-- ── Positions ────────────────────────────────────────────────
INSERT INTO positions (id, tenant_id, name, level, default_hours_week) VALUES
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Outlet Manager', 5, 45.0),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Assistant Manager', 4, 45.0),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Head Chef', 4, 45.0),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Chef de Partie', 3, 40.0),
  ('40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Cook', 2, 40.0),
  ('40000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Kitchen Helper', 1, 40.0),
  ('40000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Service Crew', 2, 40.0),
  ('40000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Senior Service Crew', 3, 40.0),
  ('40000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'Cashier', 2, 40.0),
  ('40000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Part-Time Crew', 1, 20.0);

-- ── Super Admin User ──────────────────────────────────────────
-- Seeded with a bootstrap password that MUST be changed on first login
-- (must_change_password = true). Do not document or rely on this value in
-- production — reset it immediately after the first deploy.
INSERT INTO users (id, tenant_id, email, password_hash, name, role, outlet_ids, must_change_password) VALUES
  ('50000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'admin@workforceiq.app',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2QwKfUL9Ni',
   'System Admin',
   'super_admin',
   ARRAY['20000000-0000-0000-0000-000000000001',
         '20000000-0000-0000-0000-000000000002',
         '20000000-0000-0000-0000-000000000003']::UUID[],
   true);

-- Outlet Manager for NH-KL01
INSERT INTO users (id, tenant_id, email, password_hash, name, role, outlet_ids, must_change_password) VALUES
  ('50000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'manager.klsentral@noodlehouse.my',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2QwKfUL9Ni',
   'Ahmad Razif',
   'outlet_manager',
   ARRAY['20000000-0000-0000-0000-000000000001']::UUID[],
   true);

-- ── Leave Type Configs ────────────────────────────────────────
INSERT INTO leave_type_configs (tenant_id, type, name, annual_entitlement, carry_forward_max, requires_approval, requires_document, min_notice_days, is_paid) VALUES
  ('00000000-0000-0000-0000-000000000001', 'annual', 'Annual Leave', 14, 5, true, false, 7, true),
  ('00000000-0000-0000-0000-000000000001', 'sick', 'Sick Leave', 14, 0, true, true, 0, true),
  ('00000000-0000-0000-0000-000000000001', 'emergency', 'Emergency Leave', 3, 0, true, false, 0, true),
  ('00000000-0000-0000-0000-000000000001', 'maternity', 'Maternity Leave', 60, 0, true, true, 30, true),
  ('00000000-0000-0000-0000-000000000001', 'paternity', 'Paternity Leave', 7, 0, true, false, 0, true),
  ('00000000-0000-0000-0000-000000000001', 'unpaid', 'Unpaid Leave', 0, 0, true, false, 14, false),
  ('00000000-0000-0000-0000-000000000001', 'hospitalization', 'Hospitalization Leave', 60, 0, true, true, 0, true);

-- ── Public Holidays (Malaysia 2025/2026) ──────────────────────
INSERT INTO public_holidays (country, date, name, pax_impact) VALUES
  ('MY', '2025-01-01', 'New Year''s Day', 1.4),
  ('MY', '2025-01-29', 'Chinese New Year Day 1', 1.8),
  ('MY', '2025-01-30', 'Chinese New Year Day 2', 1.6),
  ('MY', '2025-02-01', 'Federal Territory Day', 1.2),
  ('MY', '2025-03-30', 'Hari Raya Aidilfitri Day 1', 1.9),
  ('MY', '2025-03-31', 'Hari Raya Aidilfitri Day 2', 1.7),
  ('MY', '2025-05-01', 'Labour Day', 1.3),
  ('MY', '2025-05-12', 'Wesak Day', 1.3),
  ('MY', '2025-06-06', 'Agong''s Birthday', 1.2),
  ('MY', '2025-06-07', 'Hari Raya Aidiladha', 1.6),
  ('MY', '2025-08-31', 'National Day', 1.5),
  ('MY', '2025-09-16', 'Malaysia Day', 1.5),
  ('MY', '2025-10-20', 'Deepavali', 1.4),
  ('MY', '2025-12-25', 'Christmas Day', 1.5),
  ('MY', '2026-01-01', 'New Year''s Day', 1.4),
  ('MY', '2026-02-17', 'Chinese New Year Day 1', 1.8),
  ('MY', '2026-02-18', 'Chinese New Year Day 2', 1.6);

-- ── Shift Templates ────────────────────────────────────────────
INSERT INTO shift_templates (id, outlet_id, name, start_time, end_time, break_minutes, min_staff, target_staff, color) VALUES
  -- NH-KL01
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Morning', '09:00', '15:00', 30, 3, 5, '#3B82F6'),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Afternoon', '14:00', '20:00', 30, 3, 6, '#10B981'),
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Evening', '18:00', '23:00', 30, 2, 4, '#8B5CF6'),
  ('60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'Full Day', '10:00', '22:00', 60, 2, 3, '#F59E0B'),
  -- NH-PJ01
  ('60000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'Morning', '10:00', '16:00', 30, 2, 4, '#3B82F6'),
  ('60000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', 'Evening', '16:00', '22:00', 30, 2, 4, '#8B5CF6');
