import { Injectable, Inject, NotFoundException, BadRequestException } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds } from "../../common/auth/outlet-scope";
import { istTodayStr } from "../../common/utils/date.util";
import { TtlCache } from "../../common/cache/ttl-cache";
import type { AuthUser } from "@workforceiq/shared";
import {
  computeStaffing, EngineThresholds, DEFAULT_THRESHOLDS, RoleInput, OutletStaffingResult,
} from "./staffing-engine";

interface OutletMeta {
  outletId: string; name: string; code: string; categoryName: string | null; effectivePax: number | null;
}
export interface OutletComputed extends OutletMeta {
  result: OutletStaffingResult;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Real-Time Staffing service (Feature 3/4). Fetches every input in a fixed set of BATCHED,
 * grouped queries (no per-outlet N+1) and composes results through the pure engine. The same
 * builder backs the per-outlet cards, the company dashboard, and the daily snapshot cron.
 *
 * Ratio resolution is 3-tier: staff_requirement_configurations (outlet×role) →
 * ratio_templates (restaurant-category×role) → staffing_ratios (company staff-category default).
 * "current" = active staff by current_outlet_id (already reflects approved transfers);
 * transfers in/out and present are reporting overlays.
 */
@Injectable()
export class StaffingService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  // buildResults fires 11 concurrent queries against a pool capped at 10, so a single
  // dashboard load can saturate the pool and starve cheap requests (e.g. login). Cache the
  // computed result per (tenant, scope, date) for a short TTL — repeated dashboard loads
  // and the per-outlet card + company view then share one computation. The cron
  // (writeSnapshots) intentionally bypasses this and always computes fresh.
  private readonly resultCache = new TtlCache<OutletComputed[]>(
    Number(process.env.STAFFING_CACHE_TTL_MS) || 30_000,
  );

  private cachedBuild(tenantId: string, scope: string[] | null, date: string): Promise<OutletComputed[]> {
    const key = `${tenantId}|${scope ? [...scope].sort().join(",") : "*"}|${date}`;
    return this.resultCache.getOrCompute(key, () => this.buildResults(tenantId, scope, date));
  }

  private normalizeDate(date?: string): string {
    if (!date) return istTodayStr();
    if (!DATE_RE.test(date)) throw new BadRequestException("date must be YYYY-MM-DD.");
    return date;
  }

  private effectivePax(basis: string, rc: Record<string, unknown>, maxPax: number | null): number | null {
    const num = (v: unknown) => (v == null ? null : Number(v));
    if (basis === "average_daily") return num(rc.avg_daily_pax) ?? maxPax ?? null;
    // peak_period (default)
    const caps = [num(rc.lunch_capacity), num(rc.dinner_capacity)].filter((n): n is number => n != null);
    if (caps.length) return Math.max(...caps);
    return num(rc.peak_pax) ?? maxPax ?? null;
  }

  /** The one place all inputs are fetched + composed. tenant + optional outlet scope. */
  async buildResults(tenantId: string, scope: string[] | null, date: string): Promise<OutletComputed[]> {
    const [
      outletsRes, positionsRes, srcRes, tplRes, catRatioRes, thresholdsRes,
      currentRes, leaveRes, presentRes, tinRes, toutRes,
    ] = await Promise.all([
      this.db.query(
        `SELECT o.id, o.name, o.code, o.max_pax,
                rc.category_id, cat.name AS category_name, rc.avg_daily_pax, rc.peak_pax,
                rc.lunch_capacity, rc.dinner_capacity, rc.pax_basis, rc.t_excess, rc.t_minor
         FROM outlets o
         LEFT JOIN restaurant_configurations rc ON rc.outlet_id = o.id AND rc.deleted_at IS NULL
         LEFT JOIN restaurant_categories cat ON cat.id = rc.category_id
         WHERE o.tenant_id = $1 AND o.is_active = true AND ($2::uuid[] IS NULL OR o.id = ANY($2))
         ORDER BY o.name`,
        [tenantId, scope],
      ),
      this.db.query(
        `SELECT p.id, p.name, p.level, COALESCE(pcm.category, 'General') AS category
         FROM positions p
         LEFT JOIN post_category_map pcm ON pcm.tenant_id = p.tenant_id AND LOWER(pcm.post) = LOWER(p.name)
         WHERE p.tenant_id = $1 AND p.is_active = true`,
        [tenantId],
      ),
      this.db.query(
        `SELECT outlet_id, position_id, guests_per_staff, min_staff
         FROM staff_requirement_configurations
         WHERE tenant_id = $1 AND deleted_at IS NULL AND ($2::uuid[] IS NULL OR outlet_id = ANY($2))`,
        [tenantId, scope],
      ),
      this.db.query(
        "SELECT category_id, position_id, guests_per_staff, min_staff FROM ratio_templates WHERE tenant_id = $1 AND deleted_at IS NULL",
        [tenantId],
      ),
      this.db.query("SELECT category, pax_per_staff, min_staff FROM staffing_ratios WHERE tenant_id = $1", [tenantId]),
      this.thresholdsFor(tenantId),
      this.db.query(
        `SELECT current_outlet_id AS outlet_id, position_id, COUNT(*)::int n
         FROM staff WHERE tenant_id = $1 AND employment_status = 'active'
           AND current_outlet_id IS NOT NULL AND position_id IS NOT NULL
           AND ($2::uuid[] IS NULL OR current_outlet_id = ANY($2))
         GROUP BY current_outlet_id, position_id`,
        [tenantId, scope],
      ),
      this.db.query(
        `SELECT s.current_outlet_id AS outlet_id, s.position_id, COUNT(DISTINCT s.id)::int n
         FROM staff s JOIN leave_requests lr ON lr.staff_id = s.id
         WHERE s.tenant_id = $1 AND s.employment_status = 'active' AND lr.status = 'approved'
           AND lr.start_date <= $3 AND lr.end_date >= $3 AND s.position_id IS NOT NULL
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))
         GROUP BY s.current_outlet_id, s.position_id`,
        [tenantId, scope, date],
      ),
      this.db.query(
        `SELECT ar.outlet_id, s.position_id, COUNT(DISTINCT ar.staff_id)::int n
         FROM attendance_records ar JOIN staff s ON s.id = ar.staff_id
         WHERE s.tenant_id = $1 AND ar.date = $3 AND ar.status IN ('present','late','early_departure')
           AND s.position_id IS NOT NULL AND ($2::uuid[] IS NULL OR ar.outlet_id = ANY($2))
         GROUP BY ar.outlet_id, s.position_id`,
        [tenantId, scope, date],
      ),
      this.db.query(
        `SELECT st.to_outlet_id AS outlet_id, s.position_id, COUNT(DISTINCT st.staff_id)::int n
         FROM staff_transfers st JOIN staff s ON s.id = st.staff_id
         WHERE s.tenant_id = $1 AND st.status IN ('approved','completed')
           AND st.effective_date <= $3 AND (st.end_date IS NULL OR st.end_date >= $3) AND s.position_id IS NOT NULL
           AND ($2::uuid[] IS NULL OR st.to_outlet_id = ANY($2))
         GROUP BY st.to_outlet_id, s.position_id`,
        [tenantId, scope, date],
      ),
      this.db.query(
        `SELECT s.primary_outlet_id AS outlet_id, s.position_id, COUNT(*)::int n
         FROM staff s
         WHERE s.tenant_id = $1 AND s.employment_status = 'active'
           AND s.current_outlet_id IS DISTINCT FROM s.primary_outlet_id AND s.position_id IS NOT NULL
           AND ($2::uuid[] IS NULL OR s.primary_outlet_id = ANY($2))
         GROUP BY s.primary_outlet_id, s.position_id`,
        [tenantId, scope],
      ),
    ]);

    const positions = positionsRes.rows.map((p) => ({ id: p.id as string, name: p.name as string, level: p.level as number, category: p.category as string }));
    const src = new Map<string, { g: number; m: number }>(srcRes.rows.map((r) => [`${r.outlet_id}:${r.position_id}`, { g: Number(r.guests_per_staff), m: Number(r.min_staff) }]));
    const tpl = new Map<string, { g: number; m: number }>(tplRes.rows.map((r) => [`${r.category_id}:${r.position_id}`, { g: Number(r.guests_per_staff), m: Number(r.min_staff) }]));
    const catRatio = new Map<string, { g: number; m: number }>(catRatioRes.rows.map((r) => [r.category as string, { g: Number(r.pax_per_staff), m: Number(r.min_staff) }]));
    const count = (rows: { rows: { outlet_id: string; position_id: string; n: number }[] }) => {
      const m = new Map<string, number>();
      for (const r of rows.rows) m.set(`${r.outlet_id}:${r.position_id}`, Number(r.n));
      return m;
    };
    const cur = count(currentRes), lv = count(leaveRes), pr = count(presentRes), tin = count(tinRes), tout = count(toutRes);
    const g = (m: Map<string, number>, o: string, p: string) => m.get(`${o}:${p}`) ?? 0;

    return outletsRes.rows.map((o) => {
      const oid = o.id as string;
      const rc = o as Record<string, unknown>;
      const basis = (o.pax_basis as string) || "peak_period";
      const effectivePax = this.effectivePax(basis, rc, o.max_pax == null ? null : Number(o.max_pax));
      const thresholds: EngineThresholds = {
        tExcess: o.t_excess != null ? Number(o.t_excess) : thresholdsRes.tExcess,
        tMinor: o.t_minor != null ? Number(o.t_minor) : thresholdsRes.tMinor,
      };

      const roles: RoleInput[] = [];
      for (const p of positions) {
        const ratio = src.get(`${oid}:${p.id}`)
          ?? (o.category_id ? tpl.get(`${o.category_id}:${p.id}`) : undefined)
          ?? catRatio.get(p.category);
        const current = g(cur, oid, p.id);
        const present = g(pr, oid, p.id);
        const onLeave = g(lv, oid, p.id);
        const transferredIn = g(tin, oid, p.id);
        const transferredOut = g(tout, oid, p.id);
        // Include roles that are modelled OR have any people involved.
        if (!ratio && current === 0 && present === 0 && onLeave === 0 && transferredIn === 0 && transferredOut === 0) continue;
        roles.push({
          positionId: p.id, positionName: p.name,
          guestsPerStaff: ratio ? ratio.g : null, minStaff: ratio ? ratio.m : 0,
          current, onLeave, present, transferredIn, transferredOut,
        });
      }

      const result = computeStaffing({ effectivePax, thresholds, roles });
      return { outletId: oid, name: o.name as string, code: o.code as string, categoryName: (o.category_name as string) ?? null, effectivePax, result };
    });
  }

  private async thresholdsFor(tenantId: string): Promise<EngineThresholds> {
    try {
      const res = await this.db.query(
        "SELECT key, value FROM tenant_settings WHERE tenant_id = $1 AND key IN ('t_excess','t_minor')",
        [tenantId],
      );
      const m = new Map(res.rows.map((r) => [r.key as string, Number(r.value)]));
      return { tExcess: m.get("t_excess") ?? DEFAULT_THRESHOLDS.tExcess, tMinor: m.get("t_minor") ?? DEFAULT_THRESHOLDS.tMinor };
    } catch {
      return DEFAULT_THRESHOLDS;
    }
  }

  // ── endpoints ─────────────────────────────────────────────────────────────
  /** All outlets — card-grid summary. */
  async getRequirements(user: AuthUser, date?: string) {
    const d = this.normalizeDate(date);
    const results = await this.cachedBuild(user.tenantId, allowedOutletIds(user), d);
    return {
      data: {
        date: d,
        outlets: results.map((r) => ({
          outletId: r.outletId, name: r.name, code: r.code, categoryName: r.categoryName,
          effectivePax: r.effectivePax, status: r.result.status,
          required: r.result.totals.required, current: r.result.totals.current,
          available: r.result.totals.available, present: r.result.totals.present,
          onLeave: r.result.totals.onLeave, transferredIn: r.result.totals.transferredIn,
          shortage: r.result.totals.shortage, excess: r.result.totals.excess, vacant: r.result.totals.vacant,
        })),
      },
    };
  }

  /** One outlet — per-role breakdown. */
  async getOutletRequirements(user: AuthUser, outletId: string, date?: string) {
    const d = this.normalizeDate(date);
    const results = await this.cachedBuild(user.tenantId, allowedOutletIds(user), d);
    const one = results.find((r) => r.outletId === outletId);
    if (!one) throw new NotFoundException("Outlet not found or not in scope.");
    return {
      data: {
        date: d, outletId: one.outletId, name: one.name, code: one.code, categoryName: one.categoryName,
        effectivePax: one.effectivePax, status: one.result.status, totals: one.result.totals, roles: one.result.roles,
      },
    };
  }

  /** Executive company-wide dashboard (Feature 4). */
  async getCompanyStaffing(user: AuthUser, date?: string) {
    const d = this.normalizeDate(date);
    const scope = allowedOutletIds(user);
    const [results, counts] = await Promise.all([
      this.cachedBuild(user.tenantId, scope, d),
      this.companyCounts(user.tenantId, scope, d),
    ]);

    const t = results.reduce(
      (a, r) => {
        a.required += r.result.totals.required;
        a.current += r.result.totals.current;
        a.available += r.result.totals.available;
        a.shortage += r.result.totals.shortage;
        a.excess += r.result.totals.excess;
        a.vacant += r.result.totals.vacant;
        return a;
      },
      { required: 0, current: 0, available: 0, shortage: 0, excess: 0, vacant: 0 },
    );
    const operating = results.filter((r) => r.effectivePax != null).length;
    const n = operating || results.length || 1;

    // Category distribution across all outlets' roles.
    const byStatus: Record<string, number> = { green: 0, yellow: 0, red: 0, blue: 0, unconfigured: 0 };
    for (const r of results) byStatus[r.result.status] = (byStatus[r.result.status] ?? 0) + 1;

    return {
      data: {
        date: d,
        kpis: {
          totalEmployees: counts.total, activeEmployees: counts.active,
          onLeaveToday: counts.onLeave, presentToday: counts.present,
          transferredToday: counts.transferredToday, inNoticePeriod: counts.inNotice,
          requiredStaff: t.required, currentStaff: t.current,
          excess: t.excess, shortage: t.shortage, vacantPositions: t.vacant,
          restaurantsOperating: operating,
          avgStaffUtilizationPct: t.required > 0 ? Math.min(100, Math.round((t.available / t.required) * 100)) : null,
          avgEmployeesPerRestaurant: Math.round((t.current / n) * 10) / 10,
          avgRequiredStaff: Math.round((t.required / n) * 10) / 10,
          avgExcessStaff: Math.round((t.excess / n) * 10) / 10,
        },
        statusBreakdown: byStatus,
        outlets: results.map((r) => ({
          outletId: r.outletId, name: r.name, status: r.result.status, effectivePax: r.effectivePax,
          required: r.result.totals.required, current: r.result.totals.current,
          excess: r.result.totals.excess, shortage: r.result.totals.shortage,
        })),
      },
    };
  }

  private async companyCounts(tenantId: string, scope: string[] | null, date: string) {
    const res = await this.db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM staff s WHERE s.tenant_id = $1 AND s.employment_status <> 'terminated'
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))) AS total,
        (SELECT COUNT(*)::int FROM staff s WHERE s.tenant_id = $1 AND s.employment_status = 'active'
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))) AS active,
        (SELECT COUNT(DISTINCT s.id)::int FROM staff s JOIN leave_requests lr ON lr.staff_id = s.id
           WHERE s.tenant_id = $1 AND lr.status = 'approved' AND lr.start_date <= $3 AND lr.end_date >= $3
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))) AS on_leave,
        (SELECT COUNT(DISTINCT ar.staff_id)::int FROM attendance_records ar JOIN staff s ON s.id = ar.staff_id
           WHERE s.tenant_id = $1 AND ar.date = $3 AND ar.status IN ('present','late','early_departure')
           AND ($2::uuid[] IS NULL OR ar.outlet_id = ANY($2))) AS present,
        (SELECT COUNT(*)::int FROM staff_transfers st JOIN staff s ON s.id = st.staff_id
           WHERE s.tenant_id = $1 AND st.status IN ('approved','completed') AND st.effective_date = $3
           AND ($2::uuid[] IS NULL OR st.to_outlet_id = ANY($2))) AS transferred_today,
        (SELECT COUNT(*)::int FROM staff s WHERE s.tenant_id = $1 AND s.resignation_date IS NOT NULL
           AND s.employment_status <> 'terminated'
           AND (s.last_working_date IS NULL OR s.last_working_date >= $3)
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))) AS in_notice`,
      [tenantId, scope, date],
    );
    const r = res.rows[0];
    return {
      total: Number(r.total), active: Number(r.active), onLeave: Number(r.on_leave),
      present: Number(r.present), transferredToday: Number(r.transferred_today), inNotice: Number(r.in_notice),
    };
  }

  // ── snapshot writer (cron) ───────────────────────────────────────────────
  /** Upsert per-outlet, per-role snapshots for `date` across a tenant. Idempotent. */
  async writeSnapshots(tenantId: string, date: string): Promise<number> {
    const results = await this.buildResults(tenantId, null, date);
    const client = await this.db.connect();
    let written = 0;
    try {
      await client.query("BEGIN");
      for (const o of results) {
        for (const r of o.result.roles) {
          await this.upsertSnapshot(client, tenantId, o.outletId, date, r);
          written++;
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return written;
  }

  private async upsertSnapshot(client: PoolClient, tenantId: string, outletId: string, date: string, r: OutletStaffingResult["roles"][number]) {
    await client.query(
      `INSERT INTO staffing_snapshots
         (tenant_id, outlet_id, snapshot_date, position_id, required, current_staff, present, on_leave,
          transferred_in, transferred_out, available, shortage, excess, vacant, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (outlet_id, snapshot_date, position_id) DO UPDATE SET
         required = EXCLUDED.required, current_staff = EXCLUDED.current_staff, present = EXCLUDED.present,
         on_leave = EXCLUDED.on_leave, transferred_in = EXCLUDED.transferred_in, transferred_out = EXCLUDED.transferred_out,
         available = EXCLUDED.available, shortage = EXCLUDED.shortage, excess = EXCLUDED.excess,
         vacant = EXCLUDED.vacant, status = EXCLUDED.status`,
      [tenantId, outletId, date, r.positionId, r.required, r.current, r.present, r.onLeave,
       r.transferredIn, r.transferredOut, r.available, r.shortage, r.excess, r.vacant, r.status],
    );
  }

  /** Trend series for a single outlet from persisted snapshots (30/90-day charts). */
  async getTrend(user: AuthUser, outletId: string, days: number) {
    const scope = allowedOutletIds(user);
    if (scope !== null && !scope.includes(outletId)) throw new NotFoundException("Outlet not found.");
    const res = await this.db.query(
      `SELECT snapshot_date,
              SUM(required)::int AS required, SUM(available)::int AS available,
              SUM(shortage)::int AS shortage, SUM(excess)::int AS excess
       FROM staffing_snapshots
       WHERE outlet_id = $1 AND tenant_id = $2
         AND snapshot_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - ($3::int)
       GROUP BY snapshot_date ORDER BY snapshot_date`,
      [outletId, user.tenantId, days],
    );
    return { data: res.rows.map((r) => ({ date: r.snapshot_date, required: r.required, available: r.available, shortage: r.shortage, excess: r.excess })) };
  }
}
