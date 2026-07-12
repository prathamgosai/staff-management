/**
 * End-to-end RBAC harness — boots the REAL app (AppModule, so the global fail-closed
 * JwtAuthGuard + PermissionsGuard + outlet scoping are all live) against a local Postgres
 * and proves the batch-C1 fixes hold through the full HTTP stack, not just in the helper
 * unit tests.
 *
 * Requires a local Postgres with the app schema. Point it at one via env (defaults to the
 * bundled portable server on 5433 / db "workforceiq") and a local Redis on 6379:
 *   pnpm --filter @workforceiq/api test:e2e
 * It NEVER touches the live .env DB — it seeds an isolated throwaway tenant and deletes it
 * afterwards. Skips itself (does not fail) if the DB/Redis aren't reachable.
 */
process.env.DB_HOST = process.env.E2E_DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.E2E_DB_PORT || "5433";
process.env.DB_NAME = process.env.E2E_DB_NAME || "workforceiq";
process.env.DB_USER = process.env.E2E_DB_USER || "postgres";
process.env.DB_PASSWORD = process.env.E2E_DB_PASSWORD || "";
process.env.DB_SSL = "false";
process.env.JWT_SECRET = "e2e-secret-key";
process.env.REDIS_HOST = process.env.E2E_REDIS_HOST || "127.0.0.1";
process.env.NODE_ENV = "test";
process.env.TZ = process.env.TZ || "Asia/Kolkata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "crypto";
import { Pool } from "pg";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require("jsonwebtoken");
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";

const ids = {
  tenant: randomUUID(),
  brand: randomUUID(),
  outletA: randomUUID(),
  outletB: randomUUID(),
  staff: randomUUID(),
  transfer: randomUUID(),
  admin: randomUUID(),
  hoh: randomUUID(),
  // A SECOND tenant, to prove cross-tenant reads are blocked (the C1 tenant-scope fix).
  tenantB: randomUUID(),
  brandB: randomUUID(),
  outletInB: randomUUID(),
  // Shift-swap fixtures: a 2nd staff + a schedule with two shifts + two assignments + a swap.
  staff2: randomUUID(),
  schedule: randomUUID(),
  shift1: randomUUID(),
  shift2: randomUUID(),
  assign1: randomUUID(),
  assign2: randomUUID(),
  swap: randomUUID(),
};

let app: INestApplication;
let base: string;
let pool: Pool;
let dbUp = false;

async function seed() {
  await pool.query("INSERT INTO tenants (id, name, slug) VALUES ($1,$2,$3)", [ids.tenant, "E2E Tenant", `e2e-${ids.tenant.slice(0, 8)}`]);
  await pool.query("INSERT INTO brands (id, tenant_id, name) VALUES ($1,$2,$3)", [ids.brand, ids.tenant, "E2E Brand"]);
  for (const [oid, code, name] of [[ids.outletA, "E2E-A", "Outlet A"], [ids.outletB, "E2E-B", "Outlet B"]] as const) {
    await pool.query(
      `INSERT INTO outlets (id, tenant_id, brand_id, code, name, type, address, contact, operating_hours, headcount_targets, is_active)
       VALUES ($1,$2,$3,$4,$5,'dine_in','{}','{}','{}','{}',true)`,
      [oid, ids.tenant, ids.brand, code, name],
    );
  }
  await pool.query(
    `INSERT INTO staff (id, tenant_id, employee_id, name, phone, primary_outlet_id, current_outlet_id, employment_status, join_date)
     VALUES ($1,$2,'E2E-EMP-1','E2E Staff','+910000000000',$3,$3,'active', CURRENT_DATE)`,
    [ids.staff, ids.tenant, ids.outletA],
  );
  await pool.query(
    `INSERT INTO staff_transfers (id, staff_id, from_outlet_id, to_outlet_id, type, effective_date, status)
     VALUES ($1,$2,$3,$4,'temporary', CURRENT_DATE, 'pending')`,
    [ids.transfer, ids.staff, ids.outletA, ids.outletB],
  );
  // head_of_house needs the allocation permissions so it PASSES the permission guard and the
  // test isolates the OUTLET-SCOPE check (the C1 fix), not the permission check.
  for (const perm of ["allocation:read", "allocation:write"]) {
    await pool.query(
      "INSERT INTO role_permissions (tenant_id, role, permission) VALUES ($1,'head_of_house'::user_role,$2) ON CONFLICT DO NOTHING",
      [ids.tenant, perm],
    );
  }
  await pool.query(
    "INSERT INTO users (id, tenant_id, email, name, role, outlet_ids, is_active) VALUES ($1,$2,$3,'E2E Admin','admin'::user_role,'{}',true)",
    [ids.admin, ids.tenant, `e2e-admin-${ids.admin.slice(0, 8)}@example.com`],
  );
  await pool.query(
    "INSERT INTO users (id, tenant_id, email, name, role, outlet_ids, is_active) VALUES ($1,$2,$3,'E2E HoH','head_of_house'::user_role,$4,true)",
    [ids.hoh, ids.tenant, `e2e-hoh-${ids.hoh.slice(0, 8)}@example.com`, [ids.outletA]],
  );

  // Shift-swap fixtures (all within tenant A / outlet A): staff1 works shift1, staff2 works
  // shift2, and a pending swap offers to trade them.
  await pool.query(
    `INSERT INTO staff (id, tenant_id, employee_id, name, phone, primary_outlet_id, current_outlet_id, employment_status, join_date, hourly_rate)
     VALUES ($1,$2,'E2E-EMP-2','E2E Staff 2','+910000000001',$3,$3,'active', CURRENT_DATE, 100)`,
    [ids.staff2, ids.tenant, ids.outletA],
  );
  // An attendance record (8 regular + 2 OT hours) for the payroll-export test.
  await pool.query(
    `INSERT INTO attendance_records (staff_id, outlet_id, date, status, regular_hours, overtime_hours)
     VALUES ($1,$2,'2026-07-15','present',8,2)`,
    [ids.staff2, ids.outletA],
  );
  await pool.query(
    "INSERT INTO schedules (id, outlet_id, week_start_date, week_end_date, status) VALUES ($1,$2,'2026-07-06','2026-07-12','published')",
    [ids.schedule, ids.outletA],
  );
  for (const sid of [ids.shift1, ids.shift2]) {
    await pool.query(
      "INSERT INTO schedule_shifts (id, schedule_id, outlet_id, date, start_time, end_time) VALUES ($1,$2,$3,'2026-07-06','12:00','21:00')",
      [sid, ids.schedule, ids.outletA],
    );
  }
  await pool.query("INSERT INTO shift_assignments (id, shift_id, staff_id, status) VALUES ($1,$2,$3,'published')", [ids.assign1, ids.shift1, ids.staff]);
  await pool.query("INSERT INTO shift_assignments (id, shift_id, staff_id, status) VALUES ($1,$2,$3,'published')", [ids.assign2, ids.shift2, ids.staff2]);
  await pool.query(
    `INSERT INTO shift_swap_requests (id, requester_id, requester_shift_id, target_staff_id, target_shift_id, status)
     VALUES ($1,$2,$3,$4,$5,'pending')`,
    [ids.swap, ids.staff, ids.assign1, ids.staff2, ids.assign2],
  );

  // Second tenant with its own outlet — used to prove that tenant A's admin (whose scope is
  // "all outlets in tenant A") still cannot read tenant B's outlet-addressed data.
  await pool.query("INSERT INTO tenants (id, name, slug) VALUES ($1,$2,$3)", [ids.tenantB, "E2E Tenant B", `e2e-b-${ids.tenantB.slice(0, 8)}`]);
  await pool.query("INSERT INTO brands (id, tenant_id, name) VALUES ($1,$2,$3)", [ids.brandB, ids.tenantB, "E2E Brand B"]);
  await pool.query(
    `INSERT INTO outlets (id, tenant_id, brand_id, code, name, type, address, contact, operating_hours, headcount_targets, is_active)
     VALUES ($1,$2,$3,'E2E-B-OUT','Outlet in B','dine_in','{}','{}','{}','{}',true)`,
    [ids.outletInB, ids.tenantB, ids.brandB],
  );
}

async function cleanup() {
  // Name-based so it also sweeps strays from any earlier interrupted run. Explicit
  // child-first delete (don't rely on cascade being present on every FK).
  const t = await pool.query("SELECT id FROM tenants WHERE name LIKE 'E2E Tenant%'").catch(() => ({ rows: [] as { id: string }[] }));
  const tids = t.rows.map((r) => r.id);
  if (tids.length === 0) return;
  // audit_logs (written by the E1 audit on admin approve) has no ON DELETE CASCADE and
  // references both tenant and user, so it must be cleared first. Tolerate its absence
  // on an older local schema.
  await pool.query("DELETE FROM audit_logs WHERE tenant_id = ANY($1)", [tids]).catch(() => {});
  await pool.query("DELETE FROM staff_transfers WHERE staff_id IN (SELECT id FROM staff WHERE tenant_id = ANY($1))", [tids]).catch(() => {});
  // Scheduling fixtures (swap -> assignments -> shifts -> schedules), FK-safe order.
  await pool.query("DELETE FROM shift_swap_requests WHERE requester_id IN (SELECT id FROM staff WHERE tenant_id = ANY($1))", [tids]).catch(() => {});
  await pool.query("DELETE FROM shift_assignments WHERE staff_id IN (SELECT id FROM staff WHERE tenant_id = ANY($1))", [tids]).catch(() => {});
  await pool.query("DELETE FROM attendance_records WHERE staff_id IN (SELECT id FROM staff WHERE tenant_id = ANY($1))", [tids]).catch(() => {});
  await pool.query("DELETE FROM schedule_shifts WHERE outlet_id IN (SELECT id FROM outlets WHERE tenant_id = ANY($1))", [tids]).catch(() => {});
  await pool.query("DELETE FROM schedules WHERE outlet_id IN (SELECT id FROM outlets WHERE tenant_id = ANY($1))", [tids]).catch(() => {});
  await pool.query("DELETE FROM staff WHERE tenant_id = ANY($1)", [tids]).catch(() => {});
  await pool.query("DELETE FROM users WHERE tenant_id = ANY($1)", [tids]).catch(() => {});
  await pool.query("DELETE FROM role_permissions WHERE tenant_id = ANY($1)", [tids]).catch(() => {});
  await pool.query("DELETE FROM outlets WHERE tenant_id = ANY($1)", [tids]).catch(() => {});
  await pool.query("DELETE FROM brands WHERE tenant_id = ANY($1)", [tids]).catch(() => {});
  await pool.query("DELETE FROM tenants WHERE id = ANY($1)", [tids]).catch(() => {});
}

function token(user: { id: string; email: string; role: string; outletIds: string[] }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, tenantId: ids.tenant, outletIds: user.outletIds },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

const adminTok = () => token({ id: ids.admin, email: "a@e2e", role: "admin", outletIds: [] });
const hohTok = () => token({ id: ids.hoh, email: "h@e2e", role: "head_of_house", outletIds: [ids.outletA] });

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

async function apiText(path: string, token?: string) {
  const res = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, text: await res.text() };
}

beforeAll(async () => {
  pool = new Pool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD || undefined, ssl: false,
    connectionTimeoutMillis: 4000,
  });
  try {
    await pool.query("SELECT 1");
    dbUp = true;
  } catch (e) {
    // HARD-FAIL by default: this suite is opt-in (pnpm test:e2e) and is the ONLY proof the
    // RBAC scope fixes hold through the HTTP stack. Silently "passing" with 0 assertions when
    // Postgres is down would be false confidence — a reintroduced leak would still show green.
    // Set SKIP_E2E_IF_NO_DB=1 to deliberately skip when no DB is available.
    if (process.env.SKIP_E2E_IF_NO_DB === "1") {
      // eslint-disable-next-line no-console
      console.warn("[rbac.e2e] Postgres unreachable and SKIP_E2E_IF_NO_DB=1 — skipping.");
      return;
    }
    throw new Error(
      `[rbac.e2e] Postgres not reachable at ${process.env.DB_HOST}:${process.env.DB_PORT}. ` +
      `Start .services/pgsql on 5433 first, or set SKIP_E2E_IF_NO_DB=1 to skip. (${(e as Error).message})`,
    );
  }
  await cleanup(); // clear any leftovers from a failed prior run
  await seed();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0);
  const port = (app.getHttpServer().address() as { port: number }).port;
  base = `http://127.0.0.1:${port}/api/v1`;
}, 60000);

afterAll(async () => {
  // Clean up BEFORE closing the app: app.close() can stall on open handles (keep-warm
  // interval, socket.io), and cleanup must run regardless so the tenant never leaks.
  if (dbUp) await cleanup();
  if (app) {
    try { await app.close(); } catch { /* ignore shutdown errors */ }
  }
  if (pool) await pool.end();
});

// Tests are collected before beforeAll runs, so each test gates on dbUp at runtime
// (returns early — a no-op pass — when the local DB isn't reachable).
describe("RBAC e2e (allocation outlet-scope)", () => {
  it("rejects an unauthenticated request (global fail-closed JwtAuthGuard)", async () => {
    if (!dbUp) return;
    const r = await api("/allocation/transfers");
    expect(r.status).toBe(401);
  });

  it("lets an in-scope head_of_house read transfers touching its outlet", async () => {
    if (!dbUp) return;
    const r = await api("/allocation/transfers", { token: hohTok() });
    expect(r.status).toBe(200);
  });

  it("BLOCKS a head_of_house from approving a transfer to an outlet it doesn't manage (the C1 fix)", async () => {
    if (!dbUp) return;
    const r = await api(`/allocation/transfers/${ids.transfer}/review`, { method: "PUT", token: hohTok(), body: { action: "approve" } });
    expect(r.status).toBe(403);
    // And the staff member must NOT have been moved.
    const moved = await pool.query("SELECT current_outlet_id FROM staff WHERE id = $1", [ids.staff]);
    expect(moved.rows[0].current_outlet_id).toBe(ids.outletA);
  });

  it("lets an admin approve the transfer AND atomically moves the staff member", async () => {
    if (!dbUp) return;
    const r = await api(`/allocation/transfers/${ids.transfer}/review`, { method: "PUT", token: adminTok(), body: { action: "approve" } });
    expect(r.status).toBe(200);
    const moved = await pool.query("SELECT current_outlet_id FROM staff WHERE id = $1", [ids.staff]);
    expect(moved.rows[0].current_outlet_id).toBe(ids.outletB);
    const st = await pool.query("SELECT status, approved_by FROM staff_transfers WHERE id = $1", [ids.transfer]);
    expect(st.rows[0].status).toBe("approved");
    expect(st.rows[0].approved_by).toBe(ids.admin);
  });

  it("exposes the audit trail (GET /audit) to accounts:manage and shows the approval", async () => {
    if (!dbUp) return;
    // The admin approve above wrote a transfer.approve audit row (E1). accounts:manage
    // comes from the admin role's fallback permissions.
    const r = await api("/audit?entityType=staff_transfer", { token: adminTok() });
    expect(r.status).toBe(200);
    const rows = (r.json as { data: Array<{ action: string; entity_id: string }> }).data;
    expect(rows.some((x) => x.action === "transfer.approve" && x.entity_id === ids.transfer)).toBe(true);
  });

  it("denies the audit trail to a role without accounts:manage (head_of_house)", async () => {
    if (!dbUp) return;
    const r = await api("/audit", { token: hohTok() });
    expect(r.status).toBe(403);
  });

  // Cross-tenant: tenant-A admin has "all outlets" scope, but only within tenant A. These
  // outlet-addressed reads used to query by a raw outletId with NO tenant filter (the C1
  // leak); assertOutletInScope now 404s an outlet from another tenant.
  it("blocks tenant-A admin from reading tenant-B outlet headcount (cross-tenant leak fix)", async () => {
    if (!dbUp) return;
    const r = await api(`/outlets/${ids.outletInB}/headcount-status?date=2026-07-12`, { token: adminTok() });
    expect(r.status).toBe(404);
  });

  it("blocks tenant-A admin from reading tenant-B outlet KPIs on the dashboard", async () => {
    if (!dbUp) return;
    const r = await api(`/dashboard/outlet-kpis?outletId=${ids.outletInB}&startDate=2026-07-01&endDate=2026-07-12`, { token: adminTok() });
    expect(r.status).toBe(404);
  });

  it("blocks tenant-A admin from reading a tenant-B outlet's detail", async () => {
    if (!dbUp) return;
    const r = await api(`/outlets/${ids.outletInB}`, { token: adminTok() });
    expect(r.status).toBe(404);
  });

  it("still lets tenant-A admin read its OWN outlet's detail (scope isn't over-broad)", async () => {
    if (!dbUp) return;
    const r = await api(`/outlets/${ids.outletA}`, { token: adminTok() });
    expect(r.status).toBe(200);
  });

  // Shift-swap review requires schedule:write (admin has it via fallback perms;
  // head_of_house was seeded with only allocation:* so it lacks it).
  it("blocks a swap review from a role without schedule:write", async () => {
    if (!dbUp) return;
    const r = await api(`/scheduling/swap-requests/${ids.swap}/review`, { method: "PUT", token: hohTok(), body: { action: "approve" } });
    expect(r.status).toBe(403);
  });

  it("approves a shift swap and ATOMICALLY reassigns both shifts", async () => {
    if (!dbUp) return;
    const r = await api(`/scheduling/swap-requests/${ids.swap}/review`, { method: "PUT", token: adminTok(), body: { action: "approve" } });
    expect(r.status).toBe(200);
    const a1 = await pool.query("SELECT staff_id FROM shift_assignments WHERE id = $1", [ids.assign1]);
    const a2 = await pool.query("SELECT staff_id FROM shift_assignments WHERE id = $1", [ids.assign2]);
    expect(a1.rows[0].staff_id).toBe(ids.staff2); // staff2 now works shift1 …
    expect(a2.rows[0].staff_id).toBe(ids.staff); // … and staff1 now works shift2
    const sw = await pool.query("SELECT status, reviewed_by FROM shift_swap_requests WHERE id = $1", [ids.swap]);
    expect(sw.rows[0].status).toBe("approved");
    expect(sw.rows[0].reviewed_by).toBe(ids.admin);
  });

  it("rejects re-reviewing an already-decided swap", async () => {
    if (!dbUp) return;
    const r = await api(`/scheduling/swap-requests/${ids.swap}/review`, { method: "PUT", token: adminTok(), body: { action: "reject" } });
    expect(r.status).toBe(400);
  });

  // Fix #3: a decided transfer can't be re-reviewed (the approve in the 4th test stands).
  it("rejects re-reviewing an already-decided transfer", async () => {
    if (!dbUp) return;
    const r = await api(`/allocation/transfers/${ids.transfer}/review`, { method: "PUT", token: adminTok(), body: { action: "reject" } });
    expect(r.status).toBe(400);
  });

  // Fix #1: /dashboard/staff-hierarchy with NO outletId must still be outlet-scoped.
  it("scopes staff-hierarchy to the caller's outlets even when outletId is omitted", async () => {
    if (!dbUp) return;
    const r = await api("/dashboard/staff-hierarchy", { token: hohTok() });
    expect(r.status).toBe(200);
    const rows = (r.json as { data: Array<{ outlet_id: string }> }).data;
    expect(rows.length).toBeGreaterThan(0); // staff2 is at outlet A → not vacuously true
    expect(rows.every((x) => x.outlet_id === ids.outletA)).toBe(true); // never leaks outlet B / relocated staff
  });

  // Payroll CSV export — reports:export (admin has it via fallback; head_of_house doesn't).
  it("exports a payroll-summary CSV with correctly computed pay", async () => {
    if (!dbUp) return;
    const r = await apiText(`/reports/payroll-summary.csv?startDate=2026-07-01&endDate=2026-07-31`, adminTok());
    expect(r.status).toBe(200);
    expect(r.text).toContain("Employee ID,Name,Outlet");
    expect(r.text).toContain("E2E-EMP-2");
    // 8h x 100 (regular) + 2h x 100 x 1.5 (overtime) = 800 + 300 = 1100.00
    expect(r.text).toContain("1100.00");
  });

  it("denies CSV export to a role without reports:export", async () => {
    if (!dbUp) return;
    const r = await apiText(`/reports/payroll-summary.csv?startDate=2026-07-01&endDate=2026-07-31`, hohTok());
    expect(r.status).toBe(403);
  });
});
