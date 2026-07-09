import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds } from "../../common/auth/outlet-scope";
import type { AuthUser } from "@workforceiq/shared";

// Stable display order for categories.
const CATEGORY_ORDER = ["Kitchen", "Service", "Bar", "Management", "Support", "General"];

// The fixed category taxonomy (matches 017 staffing_ratios seed + post_category_map).
// Unmapped/NULL posts resolve to "General" in code.
export const STAFF_CATEGORIES = ["Kitchen", "Service", "Bar", "Management", "Support", "General"] as const;
export type StaffCategory = (typeof STAFF_CATEGORIES)[number];

@Injectable()
export class CapacityService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async getRatios(tenantId: string) {
    const [ratiosRes, covers] = await Promise.all([
      this.db.query(
        "SELECT id, category, pax_per_staff, min_staff FROM staffing_ratios WHERE tenant_id = $1 ORDER BY category",
        [tenantId],
      ),
      this.getCoversPerOnDutyStaff(tenantId),
    ]);
    return { data: { ratios: ratiosRes.rows.map((r) => this.mapRatio(r)), coversPerOnDutyStaff: covers } };
  }

  /** Tenant tuning knob: covers served per on-duty staff per day (Task 7). Default 10.
   * Tolerates a missing tenant_settings table (018 not yet applied) so the ratios page
   * still works when only 017 has been run. */
  async getCoversPerOnDutyStaff(tenantId: string): Promise<number> {
    try {
      const res = await this.db.query(
        "SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'covers_per_on_duty_staff'",
        [tenantId],
      );
      return res.rows[0] ? Number(res.rows[0].value) : 10;
    } catch {
      return 10; // tenant_settings not migrated yet
    }
  }

  async updateRatios(
    tenantId: string,
    input: {
      ratios?: { category: string; paxPerStaff: number; minStaff: number }[];
      coversPerOnDutyStaff?: number;
    },
  ) {
    const rows = Array.isArray(input.ratios) ? input.ratios : [];
    const covers = input.coversPerOnDutyStaff;
    if (rows.length === 0 && covers === undefined) {
      throw new BadRequestException("Nothing to update.");
    }
    for (const r of rows) {
      if (!(STAFF_CATEGORIES as readonly string[]).includes(r.category)) {
        throw new BadRequestException(`Unknown category: ${r.category}`);
      }
      if (typeof r.paxPerStaff !== "number" || !(r.paxPerStaff > 0)) {
        throw new BadRequestException(`${r.category}: pax per staff must be greater than 0.`);
      }
      if (typeof r.minStaff !== "number" || !Number.isInteger(r.minStaff) || r.minStaff < 0) {
        throw new BadRequestException(`${r.category}: minimum staff must be a non-negative whole number.`);
      }
    }
    if (covers !== undefined && (typeof covers !== "number" || !(covers > 0))) {
      throw new BadRequestException("Covers per on-duty staff must be greater than 0.");
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      for (const r of rows) {
        await client.query(
          `INSERT INTO staffing_ratios (tenant_id, category, pax_per_staff, min_staff)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, category)
           DO UPDATE SET pax_per_staff = EXCLUDED.pax_per_staff, min_staff = EXCLUDED.min_staff`,
          [tenantId, r.category, r.paxPerStaff, r.minStaff],
        );
      }
      if (covers !== undefined) {
        await client.query(
          `INSERT INTO tenant_settings (tenant_id, key, value)
           VALUES ($1, 'covers_per_on_duty_staff', $2)
           ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
          [tenantId, covers],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return this.getRatios(tenantId);
  }

  /**
   * Advisory cross-outlet rebalancing: per category, greedily pair surplus outlets with
   * shortage outlets (from the capacity analysis). Strings only — no writes/notifications.
   */
  async getRebalancingSuggestions(user: AuthUser) {
    const analysis = (await this.getCapacityAnalysis(user)).data as {
      outlets: { outletId: string; name: string; categories: { category: string; variance: number }[] }[];
    };

    const categories = new Set<string>();
    for (const o of analysis.outlets) for (const c of o.categories) categories.add(c.category);

    const suggestions: { category: string; count: number; fromOutletId: string; from: string; toOutletId: string; to: string; text: string }[] = [];
    for (const category of [...categories].sort((a, b) => (CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)))) {
      const varOf = (o: { categories: { category: string; variance: number }[] }) =>
        o.categories.find((c) => c.category === category)?.variance ?? 0;
      const surplus = analysis.outlets
        .map((o) => ({ id: o.outletId, name: o.name, avail: varOf(o) }))
        .filter((x) => x.avail > 0)
        .sort((a, b) => b.avail - a.avail);
      const shortage = analysis.outlets
        .map((o) => ({ id: o.outletId, name: o.name, need: -varOf(o) }))
        .filter((x) => x.need > 0)
        .sort((a, b) => b.need - a.need);

      let si = 0;
      let hi = 0;
      while (si < surplus.length && hi < shortage.length) {
        const move = Math.min(surplus[si].avail, shortage[hi].need);
        if (move > 0) {
          suggestions.push({
            category, count: move,
            fromOutletId: surplus[si].id, from: surplus[si].name,
            toOutletId: shortage[hi].id, to: shortage[hi].name,
            text: `Move ${move} ${category}: ${surplus[si].name} → ${shortage[hi].name}`,
          });
          surplus[si].avail -= move;
          shortage[hi].need -= move;
        }
        if (surplus[si].avail <= 0) si++;
        if (shortage[hi].need <= 0) hi++;
      }
    }
    return { data: { suggestions } };
  }

  /**
   * Required-vs-actual staffing for every in-scope dine-in outlet (max_pax NOT NULL).
   *   required(outlet, cat) = max(min_staff, ceil(max_pax / pax_per_staff))  [from staffing_ratios]
   *   actual(outlet, cat)   = active staff at the outlet, categorised via post_category_map
   *                           (unmapped/NULL post → 'General')
   *   variance              = actual − required  (positive = surplus, negative = shortage)
   * Outlet scope is applied uniformly (admins see all; scoped roles see only their outlets),
   * so totals + supportUnits reconcile to the active headcount WITHIN the caller's scope.
   */
  async getCapacityAnalysis(user: AuthUser) {
    const scope = allowedOutletIds(user); // null = every outlet in the tenant

    const [outletsRes, ratiosRes, actualRes] = await Promise.all([
      this.db.query(
        `SELECT id, name, code, total_tables, max_pax
         FROM outlets
         WHERE tenant_id = $1 AND is_active = true
           AND ($2::uuid[] IS NULL OR id = ANY($2))
         ORDER BY name`,
        [user.tenantId, scope],
      ),
      this.db.query(
        "SELECT category, pax_per_staff, min_staff FROM staffing_ratios WHERE tenant_id = $1",
        [user.tenantId],
      ),
      this.db.query(
        `SELECT s.current_outlet_id AS outlet_id,
                COALESCE(pcm.category, 'General') AS category,
                COUNT(*)::int AS n
         FROM staff s
         LEFT JOIN positions p ON p.id = s.position_id
         LEFT JOIN post_category_map pcm
           ON pcm.tenant_id = s.tenant_id AND LOWER(pcm.post) = LOWER(p.name)
         WHERE s.tenant_id = $1 AND s.employment_status = 'active'
           AND s.current_outlet_id IS NOT NULL
           AND ($2::uuid[] IS NULL OR s.current_outlet_id = ANY($2))
         GROUP BY s.current_outlet_id, COALESCE(pcm.category, 'General')`,
        [user.tenantId, scope],
      ),
    ]);

    const ratioMap = new Map<string, { paxPerStaff: number; minStaff: number }>(
      ratiosRes.rows.map((r) => [r.category as string, { paxPerStaff: Number(r.pax_per_staff), minStaff: Number(r.min_staff) }]),
    );

    // actual[outletId] = Map<category, count>
    const actual = new Map<string, Map<string, number>>();
    for (const row of actualRes.rows) {
      const oid = row.outlet_id as string;
      if (!actual.has(oid)) actual.set(oid, new Map());
      actual.get(oid)!.set(row.category as string, Number(row.n));
    }
    const outletActual = (oid: string): number => {
      let t = 0;
      for (const v of actual.get(oid)?.values() ?? []) t += v;
      return t;
    };
    const catSort = (a: string, b: string): number => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    };

    const outlets: unknown[] = [];
    const supportUnits: { outletId: string; name: string; actual: number }[] = [];
    let totRequired = 0;
    let totActual = 0;
    let activeStaffTotal = 0;

    for (const o of outletsRes.rows) {
      const oid = o.id as string;
      const aTotal = outletActual(oid);
      activeStaffTotal += aTotal;

      if (o.max_pax === null || o.max_pax === undefined) {
        if (aTotal > 0) supportUnits.push({ outletId: oid, name: o.name, actual: aTotal });
        continue;
      }

      const maxPax = Number(o.max_pax);
      // Union of ratio categories and any category actually present, so per-category
      // actuals always sum to actualTotal even if a mapping ever falls outside the ratios.
      const cats = new Set<string>([...ratioMap.keys(), ...(actual.get(oid)?.keys() ?? [])]);
      const categories = [...cats].sort(catSort).map((category) => {
        const r = ratioMap.get(category);
        const required = r ? Math.max(r.minStaff, Math.ceil(maxPax / r.paxPerStaff)) : 0;
        const act = actual.get(oid)?.get(category) ?? 0;
        return { category, required, actual: act, variance: act - required };
      });
      const requiredTotal = categories.reduce((s, c) => s + c.required, 0);
      totRequired += requiredTotal;
      totActual += aTotal;

      outlets.push({
        outletId: oid,
        name: o.name,
        code: o.code,
        totalTables: o.total_tables,
        maxPax,
        paxPerStaff: aTotal > 0 ? Number((maxPax / aTotal).toFixed(2)) : null,
        categories,
        requiredTotal,
        actualTotal: aTotal,
        variance: aTotal - requiredTotal,
      });
    }

    return {
      data: {
        outlets,
        totals: { requiredTotal: totRequired, actualTotal: totActual, variance: totActual - totRequired },
        supportUnits: supportUnits.sort((a, b) => b.actual - a.actual),
        activeStaffTotal,
      },
    };
  }

  /**
   * Stateless projection for a PLANNED outlet: given planned pax (or tables → pax via the
   * group average), returns per-category required staff, comparable existing outlets (within
   * ±20% pax, as a reality check), and Expansion-pool coverage. Outlet-scoped.
   */
  async getStaffingProjection(user: AuthUser, input: { plannedPax?: number; plannedTables?: number }) {
    const PAX_PER_TABLE = 5.3; // group average: 563 pax / 106 tables

    let pax = typeof input.plannedPax === "number" ? input.plannedPax : NaN;
    let inferred = false;
    if (!(pax > 0) && typeof input.plannedTables === "number" && input.plannedTables > 0) {
      pax = Math.round(input.plannedTables * PAX_PER_TABLE);
      inferred = true;
    }
    if (!(pax > 0)) throw new BadRequestException("Provide plannedPax (or plannedTables) as a positive number.");
    if (pax > 100000) throw new BadRequestException("plannedPax is unrealistically large.");

    const scope = allowedOutletIds(user);
    const lo = Math.floor(pax * 0.8);
    const hi = Math.ceil(pax * 1.2);

    const [ratiosRes, comparableRes, poolRes] = await Promise.all([
      this.db.query("SELECT category, pax_per_staff, min_staff FROM staffing_ratios WHERE tenant_id = $1", [user.tenantId]),
      this.db.query(
        `SELECT o.id, o.name, o.max_pax,
                COUNT(s.id) FILTER (WHERE s.employment_status = 'active')::int AS actual
         FROM outlets o
         LEFT JOIN staff s ON s.current_outlet_id = o.id
         WHERE o.tenant_id = $1 AND o.is_active = true AND o.max_pax IS NOT NULL
           AND o.max_pax BETWEEN $2 AND $3
           AND ($4::uuid[] IS NULL OR o.id = ANY($4))
         GROUP BY o.id, o.name, o.max_pax
         ORDER BY ABS(o.max_pax - $5)
         LIMIT 5`,
        [user.tenantId, lo, hi, scope, pax],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS n
         FROM staff s JOIN outlets o ON o.id = s.current_outlet_id
         WHERE s.tenant_id = $1 AND s.employment_status = 'active'
           AND o.name ILIKE '%expansion%'
           AND ($2::uuid[] IS NULL OR o.id = ANY($2))`,
        [user.tenantId, scope],
      ),
    ]);

    const rank = (c: string): number => {
      const i = CATEGORY_ORDER.indexOf(c);
      return i === -1 ? 99 : i;
    };
    const categories = ratiosRes.rows
      .map((r) => {
        const paxPerStaff = Number(r.pax_per_staff);
        const minStaff = Number(r.min_staff);
        return { category: r.category as string, required: Math.max(minStaff, Math.ceil(pax / paxPerStaff)) };
      })
      .sort((a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category));
    const requiredTotal = categories.reduce((s, c) => s + c.required, 0);

    const poolSize = Number(poolRes.rows[0]?.n ?? 0);

    return {
      data: {
        plannedPax: pax,
        plannedTables: input.plannedTables ?? null,
        paxInferred: inferred,
        paxPerTableAssumed: inferred ? PAX_PER_TABLE : null,
        categories,
        requiredTotal,
        comparableOutlets: comparableRes.rows.map((o) => ({
          outletId: o.id, name: o.name, maxPax: Number(o.max_pax), actualStaff: Number(o.actual),
        })),
        expansionPool: {
          poolSize,
          coveragePct: requiredTotal > 0 ? Math.round((poolSize / requiredTotal) * 100) : null,
        },
      },
    };
  }

  private mapRatio(r: Record<string, unknown>) {
    return {
      id: r.id,
      category: r.category,
      paxPerStaff: Number(r.pax_per_staff),
      minStaff: r.min_staff,
    };
  }
}
