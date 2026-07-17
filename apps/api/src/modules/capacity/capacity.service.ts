import { Injectable, Inject } from "@nestjs/common";
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

  /** Tenant tuning knob: covers served per on-duty staff per day (Task 7). Default 10.
   * Tolerates a missing tenant_settings table (018 not yet applied) so the ratios page
   * still works when only 017 has been run. */
  async getCoversPerOnDutyStaff(tenantId: string): Promise<number> {
    try {
      const res = await this.db.query(
        "SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'covers_per_on_duty_staff'",
        [tenantId],
      );
      // Clamp to a positive value: this is a DIVISOR downstream (forecast pax / covers).
      // A stray 0 (legacy row predating the 025 CHECK) would yield Infinity staff.
      const v = res.rows[0] ? Number(res.rows[0].value) : 10;
      return Number.isFinite(v) && v > 0 ? v : 10;
    } catch {
      return 10; // tenant_settings not migrated yet
    }
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
        // Non-dining unit (bakery / prep kitchen / ODC / R&D): no seating capacity to model demand
        // from, so track it against a HEADCOUNT TARGET (= its current active staff). It shows as a
        // balanced row in the per-restaurant table instead of being hidden in a support footnote.
        if (aTotal > 0) {
          supportUnits.push({ outletId: oid, name: o.name, actual: aTotal });
          outlets.push({
            outletId: oid,
            name: o.name,
            code: o.code,
            totalTables: o.total_tables,
            maxPax: null,
            basis: "headcount",
            paxPerStaff: null,
            categories: [],
            requiredTotal: aTotal,
            actualTotal: aTotal,
            variance: 0,
          });
          totRequired += aTotal;
          totActual += aTotal;
        }
        continue;
      }

      const maxPax = Number(o.max_pax);
      // Union of ratio categories and any category actually present, so per-category
      // actuals always sum to actualTotal even if a mapping ever falls outside the ratios.
      const cats = new Set<string>([...ratioMap.keys(), ...(actual.get(oid)?.keys() ?? [])]);
      const categories = [...cats].sort(catSort).map((category) => {
        const r = ratioMap.get(category);
        // Guard the divisor: a 0/negative pax_per_staff (legacy row before the 025 CHECK)
        // would make Math.ceil(maxPax / 0) = Infinity and corrupt every total. Fall back to min_staff.
        const required = r ? (r.paxPerStaff > 0 ? Math.max(r.minStaff, Math.ceil(maxPax / r.paxPerStaff)) : r.minStaff) : 0;
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
        basis: "seating",
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

}
