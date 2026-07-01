-- ============================================================
-- WorkforceIQ — PostgreSQL 16 + TimescaleDB Schema
-- Run order: 001_schema.sql → 002_seed.sql
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy search on staff names
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- TimescaleDB is optional. It powers the pax_data time-series hypertable, but the
-- platform runs fine on vanilla PostgreSQL (pax_data falls back to a plain table).
-- Wrapped so a missing extension does NOT abort the whole schema load.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "timescaledb";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TimescaleDB not available — pax_data will be a plain PostgreSQL table.';
END $$;

-- ──────────────────────────────────────────────────────────────
-- ENUMS
-- ──────────────────────────────────────────────────────────────
CREATE TYPE employment_type     AS ENUM ('full_time','part_time','contract','temporary','intern');
CREATE TYPE employment_status   AS ENUM ('active','inactive','on_leave','probation','terminated','resigned');
CREATE TYPE shift_status        AS ENUM ('draft','published','acknowledged','in_progress','completed','cancelled');
CREATE TYPE attendance_status   AS ENUM ('present','absent','late','early_departure','on_leave','public_holiday','rest_day');
CREATE TYPE leave_status        AS ENUM ('pending','approved','rejected','cancelled','withdrawn');
CREATE TYPE leave_type_enum     AS ENUM ('annual','sick','emergency','maternity','paternity','unpaid','replacement','hospitalization');
CREATE TYPE transfer_status     AS ENUM ('pending','approved','rejected','completed');
CREATE TYPE transfer_type_enum  AS ENUM ('permanent','temporary','secondment');
CREATE TYPE notif_channel       AS ENUM ('whatsapp','email','in_app','sms');
CREATE TYPE notif_status        AS ENUM ('queued','sent','delivered','failed','read');
CREATE TYPE forecast_model_enum AS ENUM ('rule_based','prophet','xgboost','ensemble');
CREATE TYPE day_of_week_enum    AS ENUM ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');
CREATE TYPE overtime_policy     AS ENUM ('none','paid','time_off','hybrid');
CREATE TYPE outlet_type         AS ENUM ('dine_in','quick_service','cafe','cloud_kitchen','bar','other');
CREATE TYPE clock_method        AS ENUM ('manual','biometric','qr_code','mobile_gps');
CREATE TYPE user_role           AS ENUM ('super_admin','operations_head','hr_manager','outlet_manager','department_head','employee','viewer');

-- ──────────────────────────────────────────────────────────────
-- TENANTS  (multi-tenant root)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE tenants (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(200) NOT NULL,
    slug          VARCHAR(100) UNIQUE NOT NULL,
    logo_url      TEXT,
    country       VARCHAR(10) DEFAULT 'MY',
    timezone      VARCHAR(50) DEFAULT 'Asia/Kuala_Lumpur',
    currency      VARCHAR(10) DEFAULT 'MYR',
    is_active     BOOLEAN DEFAULT TRUE,
    settings      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- BRANDS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE brands (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name          VARCHAR(200) NOT NULL,
    logo_url      TEXT,
    description   TEXT,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- OUTLETS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE outlets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    brand_id            UUID NOT NULL REFERENCES brands(id),
    code                VARCHAR(20) NOT NULL,
    name                VARCHAR(200) NOT NULL,
    type                outlet_type NOT NULL DEFAULT 'dine_in',
    address             JSONB NOT NULL DEFAULT '{}',
    contact             JSONB NOT NULL DEFAULT '{}',
    seating_capacity    INTEGER,
    operating_hours     JSONB NOT NULL DEFAULT '[]',
    headcount_targets   JSONB NOT NULL DEFAULT '[]',
    overtime_policy     overtime_policy DEFAULT 'paid',
    ot_threshold_hours  NUMERIC(4,1) DEFAULT 8.0,
    schedule_lead_days  INTEGER DEFAULT 7,
    swap_needs_approval BOOLEAN DEFAULT TRUE,
    auto_schedule       BOOLEAN DEFAULT FALSE,
    forecast_model      forecast_model_enum DEFAULT 'rule_based',
    labor_cost_target   NUMERIC(5,2),
    is_active           BOOLEAN DEFAULT TRUE,
    open_date           DATE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- ──────────────────────────────────────────────────────────────
-- DEPARTMENTS  (per-outlet)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE departments (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id     UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    sort_order    INTEGER DEFAULT 0,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outlet_id, name)
);

-- ──────────────────────────────────────────────────────────────
-- POSITIONS / JOB ROLES  (tenant-wide, shared across outlets)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE positions (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_template  VARCHAR(100),
    name                 VARCHAR(100) NOT NULL,
    level                INTEGER DEFAULT 1,
    default_hours_week   NUMERIC(4,1) DEFAULT 40.0,
    is_active            BOOLEAN DEFAULT TRUE,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- USERS  (login accounts, separate from staff profiles)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           VARCHAR(320) NOT NULL,
    password_hash   TEXT,
    name            VARCHAR(200) NOT NULL,
    role            user_role NOT NULL DEFAULT 'employee',
    outlet_ids      UUID[] DEFAULT '{}',
    avatar_url      TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    password_reset_token  TEXT,
    password_reset_expiry TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    device_info TEXT,
    ip_address  INET,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- STAFF  (employee profiles)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE staff (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id              UUID REFERENCES users(id),
    employee_id          VARCHAR(30) NOT NULL,
    name                 VARCHAR(200) NOT NULL,
    email                VARCHAR(320),
    phone                VARCHAR(30) NOT NULL,
    whatsapp             VARCHAR(30),
    avatar_url           TEXT,
    national_id          VARCHAR(30),
    passport_number      VARCHAR(30),
    nationality          VARCHAR(50),
    date_of_birth        DATE,
    address              JSONB DEFAULT '{}',
    emergency_contact    JSONB DEFAULT '{}',
    primary_outlet_id    UUID NOT NULL REFERENCES outlets(id),
    current_outlet_id    UUID NOT NULL REFERENCES outlets(id),
    department_id        UUID REFERENCES departments(id),
    position_id          UUID REFERENCES positions(id),
    reporting_manager_id UUID REFERENCES staff(id),
    employment_type      employment_type NOT NULL DEFAULT 'full_time',
    employment_status    employment_status NOT NULL DEFAULT 'probation',
    join_date            DATE NOT NULL,
    confirmation_date    DATE,
    resignation_date     DATE,
    last_working_date    DATE,
    base_salary          NUMERIC(12,2),
    hourly_rate          NUMERIC(8,2),
    weekly_hours         NUMERIC(4,1) DEFAULT 40.0,
    overtime_eligible    BOOLEAN DEFAULT TRUE,
    bank_account         JSONB DEFAULT '{}',
    meta                 JSONB DEFAULT '{}',
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, employee_id)
);

CREATE TABLE staff_documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    type         VARCHAR(30) NOT NULL,
    name         VARCHAR(200) NOT NULL,
    file_url     TEXT NOT NULL,
    expiry_date  DATE,
    uploaded_by  UUID REFERENCES users(id),
    uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- SHIFT TEMPLATES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE shift_templates (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id         UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    start_time        TIME NOT NULL,
    end_time          TIME NOT NULL,
    break_minutes     INTEGER DEFAULT 30,
    is_overnight      BOOLEAN DEFAULT FALSE,
    color             VARCHAR(7),
    applicable_positions UUID[] DEFAULT '{}',
    min_staff         INTEGER DEFAULT 1,
    target_staff      INTEGER DEFAULT 2,
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- SCHEDULES  (weekly schedule container)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE schedules (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id        UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    week_start_date  DATE NOT NULL,
    week_end_date    DATE NOT NULL,
    status           VARCHAR(20) DEFAULT 'draft',
    published_at     TIMESTAMPTZ,
    published_by     UUID REFERENCES users(id),
    auto_generated   BOOLEAN DEFAULT FALSE,
    labor_cost_est   NUMERIC(12,2),
    coverage_pct     NUMERIC(5,2),
    notes            TEXT,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(outlet_id, week_start_date)
);

-- ──────────────────────────────────────────────────────────────
-- SCHEDULE SHIFTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE schedule_shifts (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id    UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    template_id    UUID REFERENCES shift_templates(id),
    outlet_id      UUID NOT NULL REFERENCES outlets(id),
    department_id  UUID REFERENCES departments(id),
    position_id    UUID REFERENCES positions(id),
    date           DATE NOT NULL,
    start_time     TIME NOT NULL,
    end_time       TIME NOT NULL,
    break_minutes  INTEGER DEFAULT 30,
    is_overnight   BOOLEAN DEFAULT FALSE,
    min_staff      INTEGER DEFAULT 1,
    target_staff   INTEGER DEFAULT 2,
    status         shift_status DEFAULT 'draft',
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- SHIFT ASSIGNMENTS  (staff → shift mapping)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE shift_assignments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id         UUID NOT NULL REFERENCES schedule_shifts(id) ON DELETE CASCADE,
    staff_id         UUID NOT NULL REFERENCES staff(id),
    status           shift_status DEFAULT 'draft',
    acknowledged_at  TIMESTAMPTZ,
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shift_id, staff_id)
);

-- ──────────────────────────────────────────────────────────────
-- SHIFT SWAP REQUESTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE shift_swap_requests (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id       UUID NOT NULL REFERENCES staff(id),
    requester_shift_id UUID NOT NULL REFERENCES shift_assignments(id),
    target_staff_id    UUID REFERENCES staff(id),
    target_shift_id    UUID REFERENCES shift_assignments(id),
    reason             TEXT,
    status             VARCHAR(20) DEFAULT 'pending',
    reviewed_by        UUID REFERENCES users(id),
    reviewed_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- ATTENDANCE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE attendance_records (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id                UUID NOT NULL REFERENCES staff(id),
    outlet_id               UUID NOT NULL REFERENCES outlets(id),
    shift_id                UUID REFERENCES schedule_shifts(id),
    date                    DATE NOT NULL,
    clock_in                TIMESTAMPTZ,
    clock_out               TIMESTAMPTZ,
    break_minutes           INTEGER DEFAULT 0,
    regular_hours           NUMERIC(4,2) DEFAULT 0,
    overtime_hours          NUMERIC(4,2) DEFAULT 0,
    late_minutes            INTEGER DEFAULT 0,
    early_departure_minutes INTEGER DEFAULT 0,
    status                  attendance_status NOT NULL DEFAULT 'absent',
    clock_in_method         clock_method,
    clock_out_method        clock_method,
    gps_clock_in            POINT,
    gps_clock_out           POINT,
    verified_by             UUID REFERENCES users(id),
    verified_at             TIMESTAMPTZ,
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(staff_id, date)
);

CREATE TABLE attendance_corrections (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_id        UUID NOT NULL REFERENCES attendance_records(id),
    requested_by         UUID NOT NULL REFERENCES users(id),
    original_clock_in    TIMESTAMPTZ,
    original_clock_out   TIMESTAMPTZ,
    corrected_clock_in   TIMESTAMPTZ,
    corrected_clock_out  TIMESTAMPTZ,
    reason               TEXT NOT NULL,
    status               VARCHAR(20) DEFAULT 'pending',
    approved_by          UUID REFERENCES users(id),
    approved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- LEAVE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE leave_type_configs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type                leave_type_enum NOT NULL,
    name                VARCHAR(100) NOT NULL,
    annual_entitlement  NUMERIC(5,1) DEFAULT 14,
    carry_forward_max   NUMERIC(5,1) DEFAULT 0,
    requires_approval   BOOLEAN DEFAULT TRUE,
    requires_document   BOOLEAN DEFAULT FALSE,
    min_notice_days     INTEGER DEFAULT 0,
    is_paid             BOOLEAN DEFAULT TRUE,
    is_active           BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, type)
);

CREATE TABLE leave_balances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    leave_type_id   UUID NOT NULL REFERENCES leave_type_configs(id),
    year            INTEGER NOT NULL,
    entitlement     NUMERIC(5,1) NOT NULL DEFAULT 0,
    taken           NUMERIC(5,1) NOT NULL DEFAULT 0,
    pending         NUMERIC(5,1) NOT NULL DEFAULT 0,
    carry_forward   NUMERIC(5,1) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(staff_id, leave_type_id, year)
);

CREATE TABLE leave_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id        UUID NOT NULL REFERENCES staff(id),
    leave_type_id   UUID NOT NULL REFERENCES leave_type_configs(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    total_days      NUMERIC(5,1) NOT NULL,
    half_day_option VARCHAR(2),
    reason          TEXT,
    document_url    TEXT,
    status          leave_status DEFAULT 'pending',
    applied_at      TIMESTAMPTZ DEFAULT NOW(),
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT
);

-- ──────────────────────────────────────────────────────────────
-- STAFF TRANSFERS / ALLOCATION
-- ──────────────────────────────────────────────────────────────
CREATE TABLE staff_transfers (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id         UUID NOT NULL REFERENCES staff(id),
    from_outlet_id   UUID NOT NULL REFERENCES outlets(id),
    to_outlet_id     UUID NOT NULL REFERENCES outlets(id),
    type             transfer_type_enum DEFAULT 'temporary',
    effective_date   DATE NOT NULL,
    end_date         DATE,
    reason           TEXT,
    status           transfer_status DEFAULT 'pending',
    requested_by     UUID REFERENCES users(id),
    approved_by      UUID REFERENCES users(id),
    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- FORECASTING
-- ──────────────────────────────────────────────────────────────

-- TimescaleDB hypertable: PAX / cover count time-series
CREATE TABLE pax_data (
    outlet_id        UUID NOT NULL REFERENCES outlets(id),
    recorded_at      TIMESTAMPTZ NOT NULL,
    date             DATE NOT NULL,
    hour             SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
    pax_count        INTEGER NOT NULL DEFAULT 0,
    revenue          NUMERIC(12,2),
    day_of_week      SMALLINT NOT NULL,
    is_public_holiday BOOLEAN DEFAULT FALSE,
    weather          VARCHAR(50),
    special_event    VARCHAR(200),
    PRIMARY KEY (outlet_id, recorded_at)
);
-- Convert pax_data to a TimescaleDB hypertable when the extension is present;
-- on vanilla PostgreSQL this is skipped and pax_data stays a regular table.
DO $$
BEGIN
  PERFORM create_hypertable('pax_data', 'recorded_at', if_not_exists => TRUE);
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'create_hypertable() unavailable — pax_data remains a plain table.';
END $$;

-- Demand forecast results
CREATE TABLE demand_forecasts (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id        UUID NOT NULL REFERENCES outlets(id),
    forecast_date    DATE NOT NULL,
    horizon          VARCHAR(20) NOT NULL,
    model            forecast_model_enum NOT NULL,
    generated_at     TIMESTAMPTZ DEFAULT NOW(),
    hourly_forecasts JSONB NOT NULL DEFAULT '[]',
    daily_summary    JSONB NOT NULL DEFAULT '{}',
    confidence       NUMERIC(4,2) DEFAULT 0,
    accuracy         NUMERIC(4,2),
    UNIQUE(outlet_id, forecast_date, model)
);

CREATE TABLE labor_ratio_configs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id        UUID NOT NULL REFERENCES outlets(id),
    position_id      UUID NOT NULL REFERENCES positions(id),
    pax_per_staff    NUMERIC(5,1) DEFAULT 20,
    min_staff        INTEGER DEFAULT 1,
    max_staff        INTEGER DEFAULT 10,
    peak_multiplier  NUMERIC(3,2) DEFAULT 1.0,
    UNIQUE(outlet_id, position_id)
);

CREATE TABLE public_holidays (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country          VARCHAR(10) NOT NULL,
    state            VARCHAR(50),
    date             DATE NOT NULL,
    name             VARCHAR(200) NOT NULL,
    pax_impact       NUMERIC(4,2) DEFAULT 1.5
);

CREATE TABLE special_events (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID REFERENCES tenants(id),
    outlet_id        UUID REFERENCES outlets(id),
    name             VARCHAR(200) NOT NULL,
    date             DATE NOT NULL,
    pax_impact       NUMERIC(4,2) DEFAULT 1.3,
    notes            TEXT
);

-- ──────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE notification_templates (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type    VARCHAR(50) NOT NULL,
    channel       notif_channel NOT NULL,
    language      VARCHAR(10) DEFAULT 'en',
    subject       VARCHAR(300),
    body_template TEXT NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, event_type, channel, language)
);

CREATE TABLE notification_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    recipient_id        UUID REFERENCES staff(id),
    recipient_phone     VARCHAR(30),
    recipient_email     VARCHAR(320),
    channel             notif_channel NOT NULL,
    event_type          VARCHAR(50) NOT NULL,
    subject             VARCHAR(300),
    body                TEXT NOT NULL,
    status              notif_status DEFAULT 'queued',
    provider_msg_id     VARCHAR(200),
    sent_at             TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    failure_reason      TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    staff_id      UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    channel       notif_channel NOT NULL,
    event_type    VARCHAR(50) NOT NULL,
    enabled       BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (staff_id, channel, event_type)
);

-- ──────────────────────────────────────────────────────────────
-- PAYROLL EXPORT (Phase 2)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE payroll_periods (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    outlet_id     UUID REFERENCES outlets(id),
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    status        VARCHAR(20) DEFAULT 'draft',
    exported_at   TIMESTAMPTZ,
    exported_by   UUID REFERENCES users(id),
    file_url      TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payroll_records (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id),
    staff_id          UUID NOT NULL REFERENCES staff(id),
    regular_hours     NUMERIC(6,2) DEFAULT 0,
    overtime_hours    NUMERIC(6,2) DEFAULT 0,
    leave_days_paid   NUMERIC(5,1) DEFAULT 0,
    base_pay          NUMERIC(12,2) DEFAULT 0,
    overtime_pay      NUMERIC(12,2) DEFAULT 0,
    allowances        NUMERIC(12,2) DEFAULT 0,
    deductions        NUMERIC(12,2) DEFAULT 0,
    gross_pay         NUMERIC(12,2) DEFAULT 0,
    net_pay           NUMERIC(12,2) DEFAULT 0,
    attendance_data   JSONB DEFAULT '{}',
    UNIQUE(payroll_period_id, staff_id)
);

-- ──────────────────────────────────────────────────────────────
-- AUDIT LOG
-- ──────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id),
    user_id      UUID REFERENCES users(id),
    action       VARCHAR(100) NOT NULL,
    entity_type  VARCHAR(50) NOT NULL,
    entity_id    UUID,
    old_values   JSONB,
    new_values   JSONB,
    ip_address   INET,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- INDEXES
-- ──────────────────────────────────────────────────────────────
CREATE INDEX idx_staff_tenant           ON staff(tenant_id);
CREATE INDEX idx_staff_outlet           ON staff(current_outlet_id);
CREATE INDEX idx_staff_status           ON staff(employment_status);
CREATE INDEX idx_staff_name_trgm        ON staff USING gin(name gin_trgm_ops);
CREATE INDEX idx_schedules_outlet_week  ON schedules(outlet_id, week_start_date);
CREATE INDEX idx_shifts_schedule        ON schedule_shifts(schedule_id);
CREATE INDEX idx_shifts_date            ON schedule_shifts(date);
CREATE INDEX idx_assignments_shift      ON shift_assignments(shift_id);
CREATE INDEX idx_assignments_staff      ON shift_assignments(staff_id);
CREATE INDEX idx_attendance_staff_date  ON attendance_records(staff_id, date DESC);
CREATE INDEX idx_attendance_outlet_date ON attendance_records(outlet_id, date DESC);
CREATE INDEX idx_leave_staff            ON leave_requests(staff_id);
CREATE INDEX idx_leave_status           ON leave_requests(status);
CREATE INDEX idx_leave_dates            ON leave_requests(start_date, end_date);
CREATE INDEX idx_transfers_staff        ON staff_transfers(staff_id);
CREATE INDEX idx_notif_log_recipient    ON notification_logs(recipient_id, created_at DESC);
CREATE INDEX idx_audit_entity           ON audit_logs(entity_type, entity_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants','brands','outlets','users','staff',
    'schedules','schedule_shifts','shift_assignments',
    'attendance_records','staff_transfers'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
