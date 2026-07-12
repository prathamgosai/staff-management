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
}

async function cleanup() {
  // Name-based so it also sweeps strays from any earlier interrupted run. Explicit
  // child-first delete (don't rely on cascade being present on every FK).
  const t = await pool.query("SELECT id FROM tenants WHERE name = 'E2E Tenant'").catch(() => ({ rows: [] as { id: string }[] }));
  const tids = t.rows.map((r) => r.id);
  if (tids.length === 0) return;
  // audit_logs (written by the E1 audit on admin approve) has no ON DELETE CASCADE and
  // references both tenant and user, so it must be cleared first. Tolerate its absence
  // on an older local schema.
  await pool.query("DELETE FROM audit_logs WHERE tenant_id = ANY($1)", [tids]).catch(() => {});
  await pool.query("DELETE FROM staff_transfers WHERE staff_id IN (SELECT id FROM staff WHERE tenant_id = ANY($1))", [tids]).catch(() => {});
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

beforeAll(async () => {
  pool = new Pool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD || undefined, ssl: false,
    connectionTimeoutMillis: 4000,
  });
  try {
    await pool.query("SELECT 1");
    dbUp = true;
  } catch {
    // eslint-disable-next-line no-console
    console.warn("[rbac.e2e] local Postgres not reachable — skipping e2e (start .services/pgsql on 5433).");
    return;
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
});
