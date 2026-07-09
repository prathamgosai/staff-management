import { Injectable, Inject, BadRequestException, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds } from "../../common/auth/outlet-scope";
import { toLocalDateStr } from "../../common/utils/week.util";
import { CapacityService } from "../capacity/capacity.service";
import { SchedulingService } from "../scheduling/scheduling.service";
import type { AuthUser } from "@workforceiq/shared";

@Injectable()
export class ForecastingService {
  private readonly mlServiceUrl: string;

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
    private readonly capacityService: CapacityService,
    private readonly schedulingService: SchedulingService,
  ) {
    this.mlServiceUrl = config.get("ML_SERVICE_URL", "http://localhost:8000");
  }

  async generateForecast(body: { outletId: string; startDate: string; endDate: string; model?: string }) {
    const enableML = this.config.get("ENABLE_ML_FORECASTING") === "true";

    if (enableML) {
      const response = await axios.post(`${this.mlServiceUrl}/forecast/generate`, body);
      return { data: response.data };
    }

    // Rule-based fallback: use historical PAX averages
    const result = await this.db.query(
      `SELECT date, hour,
              AVG(pax_count) AS avg_pax,
              AVG(revenue) AS avg_revenue
       FROM pax_data
       WHERE outlet_id = $1
         AND date BETWEEN $2::date - INTERVAL '4 weeks' AND $2::date - INTERVAL '1 week'
       GROUP BY date, hour`,
      [body.outletId, body.startDate],
    );

    return {
      data: {
        model: "rule_based",
        outletId: body.outletId,
        period: { startDate: body.startDate, endDate: body.endDate },
        historicalAverage: result.rows,
        message: "Rule-based forecast generated from 4-week historical average",
      },
    };
  }

  async getForecasts(outletId: string, startDate: string, endDate: string) {
    const result = await this.db.query(
      `SELECT * FROM demand_forecasts
       WHERE outlet_id = $1 AND forecast_date BETWEEN $2 AND $3
       ORDER BY forecast_date`,
      [outletId, startDate, endDate],
    );
    return { data: result.rows };
  }

  async ingestPaxData(outletId: string, data: Array<{ date: string; hour: number; paxCount: number; revenue?: number }>) {
    const values = data.map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`).join(",");
    const params = data.flatMap((d) => [
      outletId,
      `${d.date} ${String(d.hour).padStart(2, "0")}:00:00`,
      d.date,
      d.hour,
      d.paxCount,
      d.revenue ?? null,
    ]);
    await this.db.query(
      `INSERT INTO pax_data (outlet_id, recorded_at, date, hour, pax_count, revenue, day_of_week)
       VALUES ${values.replace(/\(\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+),\$(\d+)\)/g, (_m, a, b, c, d, e, f) => `($${a},$${b},$${c},$${d},$${e},$${f},EXTRACT(DOW FROM $${c}::date)::smallint)`)}
       ON CONFLICT (outlet_id, recorded_at) DO UPDATE SET pax_count = EXCLUDED.pax_count, revenue = EXCLUDED.revenue`,
      params,
    );
    return { data: { inserted: data.length } };
  }

  async getPaxData(outletId: string, startDate: string, endDate: string) {
    const result = await this.db.query(
      `SELECT date, hour, pax_count, revenue, day_of_week, is_public_holiday, special_event
       FROM pax_data
       WHERE outlet_id = $1 AND date BETWEEN $2 AND $3
       ORDER BY date, hour`,
      [outletId, startDate, endDate],
    );
    return { data: result.rows };
  }

  async getAccuracyReport(outletId: string, startDate: string, endDate: string) {
    const result = await this.db.query(
      `SELECT model, AVG(accuracy) AS avg_accuracy, COUNT(*) AS sample_count
       FROM demand_forecasts
       WHERE outlet_id = $1 AND forecast_date BETWEEN $2 AND $3 AND accuracy IS NOT NULL
       GROUP BY model`,
      [outletId, startDate, endDate],
    );
    return { data: result.rows };
  }

  /**
   * Bulk import of DAILY covers (one row per outlet-day). Reuses pax_data: stored at a
   * fixed daily timestamp (noon) so (outlet_id, recorded_at) is a stable per-day upsert key;
   * the authoritative `date` column drives day-of-week logic (Task 7). Tenant + outlet scoped:
   * unknown / out-of-scope outlets are skipped, never created. NOTE: rows carry `pax` (covers),
   * never revenue-as-covers — the client converts revenue→covers before sending.
   */
  async importDailyPax(
    user: AuthUser,
    rows: Array<{ outletId?: string; outletName?: string; date: string; pax: number; revenue?: number | null }>,
  ) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException("No rows to import.");
    if (rows.length > 5000) throw new BadRequestException("Too many rows (max 5000). Split the file.");

    const scope = allowedOutletIds(user);
    const outletsRes = await this.db.query(
      `SELECT id, name FROM outlets
       WHERE tenant_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2))`,
      [user.tenantId, scope],
    );
    const byId = new Set<string>();
    const byName = new Map<string, string>();
    for (const o of outletsRes.rows) {
      byId.add(o.id as string);
      byName.set(String(o.name).toLowerCase().trim(), o.id as string);
    }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const valid: { outletId: string; date: string; pax: number; revenue: number | null }[] = [];
    const skipped: { row: number; reason: string }[] = [];

    rows.forEach((r, i) => {
      const rowNum = i + 1;
      let outletId: string | undefined;
      if (r.outletId) {
        if (!byId.has(r.outletId)) { skipped.push({ row: rowNum, reason: "Outlet id not found or out of scope" }); return; }
        outletId = r.outletId;
      } else if (r.outletName) {
        outletId = byName.get(String(r.outletName).toLowerCase().trim());
        if (!outletId) { skipped.push({ row: rowNum, reason: `Unknown outlet "${r.outletName}"` }); return; }
      } else { skipped.push({ row: rowNum, reason: "Missing outlet" }); return; }

      if (!r.date || !dateRe.test(r.date)) { skipped.push({ row: rowNum, reason: `Invalid date "${r.date}" (need YYYY-MM-DD)` }); return; }
      const pax = Number(r.pax);
      if (!Number.isInteger(pax) || pax < 0) { skipped.push({ row: rowNum, reason: `Invalid pax "${r.pax}"` }); return; }
      const revenue = r.revenue === null || r.revenue === undefined ? null : Number(r.revenue);
      if (revenue !== null && (!Number.isFinite(revenue) || revenue < 0)) { skipped.push({ row: rowNum, reason: "Invalid revenue" }); return; }

      valid.push({ outletId, date: r.date, pax, revenue });
    });

    let imported = 0;
    let updated = 0;
    if (valid.length > 0) {
      const valuesSql = valid
        .map((_, i) => {
          const b = i * 4;
          return `($${b + 1}::uuid, ($${b + 2}::date + TIME '12:00'), $${b + 2}::date, 12, $${b + 3}::int, $${b + 4}::numeric, EXTRACT(DOW FROM $${b + 2}::date)::smallint)`;
        })
        .join(",");
      const params = valid.flatMap((v) => [v.outletId, v.date, v.pax, v.revenue]);
      const res = await this.db.query(
        `INSERT INTO pax_data (outlet_id, recorded_at, date, hour, pax_count, revenue, day_of_week)
         VALUES ${valuesSql}
         ON CONFLICT (outlet_id, recorded_at)
         DO UPDATE SET pax_count = EXCLUDED.pax_count, revenue = EXCLUDED.revenue,
                       date = EXCLUDED.date, day_of_week = EXCLUDED.day_of_week
         RETURNING (xmax = 0) AS inserted`,
        params,
      );
      for (const row of res.rows) { if (row.inserted) imported++; else updated++; }
    }

    return { data: { imported, updated, skipped } };
  }

  /** Scoped read of imported daily covers for one outlet. */
  async getDailyPax(user: AuthUser, outletId: string, from?: string, to?: string) {
    if (!outletId) throw new BadRequestException("outletId is required.");
    const scope = allowedOutletIds(user);
    const chk = await this.db.query(
      `SELECT 1 FROM outlets WHERE id = $1 AND tenant_id = $2 AND ($3::uuid[] IS NULL OR id = ANY($3))`,
      [outletId, user.tenantId, scope],
    );
    if (!chk.rows[0]) throw new NotFoundException("Outlet not found");

    const conditions = ["outlet_id = $1"];
    const params: unknown[] = [outletId];
    let i = 2;
    if (from) { conditions.push(`date >= $${i++}::date`); params.push(from); }
    if (to) { conditions.push(`date <= $${i++}::date`); params.push(to); }
    const res = await this.db.query(
      `SELECT date, pax_count, revenue FROM pax_data WHERE ${conditions.join(" AND ")} ORDER BY date`,
      params,
    );
    return { data: res.rows.map((r) => ({ date: r.date, pax: r.pax_count, revenue: r.revenue })) };
  }

  /**
   * Phase-1 day-of-week forecast for the target week: for each day, a recency-weighted
   * (4/3/2/1) average of the last ≤4 same-weekday pax values before weekStart. <2 datapoints
   * → null forecast + "insufficient_data". Suggested on-duty = ceil(forecast / covers_per_on_duty_staff);
   * rostered comes from the scheduling coverage summary. Outlet-scoped. Pure TS/SQL — no ML.
   */
  async getStaffingSuggestions(user: AuthUser, outletId: string, weekStart: string) {
    if (!outletId) throw new BadRequestException("outletId is required.");
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new BadRequestException("weekStart must be YYYY-MM-DD.");
    }
    const scope = allowedOutletIds(user);
    const chk = await this.db.query(
      `SELECT 1 FROM outlets WHERE id = $1 AND tenant_id = $2 AND ($3::uuid[] IS NULL OR id = ANY($3))`,
      [outletId, user.tenantId, scope],
    );
    if (!chk.rows[0]) throw new NotFoundException("Outlet not found");

    const covers = await this.capacityService.getCoversPerOnDutyStaff(user.tenantId);

    const [histRes, coverage] = await Promise.all([
      this.db.query(
        `SELECT date, pax_count, EXTRACT(DOW FROM date)::int AS dow
         FROM pax_data
         WHERE outlet_id = $1 AND date < $2::date AND date >= $2::date - INTERVAL '8 weeks'
         ORDER BY date DESC`,
        [outletId, weekStart],
      ),
      this.schedulingService.getCoverageSummary(outletId, weekStart),
    ]);

    // Last up-to-4 same-weekday pax values, most recent first.
    const byDow = new Map<number, number[]>();
    for (const r of histRes.rows) {
      const dow = Number(r.dow);
      const arr = byDow.get(dow) ?? [];
      if (arr.length < 4) { arr.push(Number(r.pax_count)); byDow.set(dow, arr); }
    }

    const rosteredByDate = new Map<string, number>();
    for (const row of (coverage.data as { date: Date | string; total_assigned: string }[]) ?? []) {
      rosteredByDate.set(toLocalDateStr(row.date), Number(row.total_assigned));
    }

    const WEIGHTS = [4, 3, 2, 1];
    const base = new Date(`${weekStart}T00:00:00`);
    const days: {
      date: string; dow: number; forecastPax: number | null;
      suggested: number | null; rostered: number; delta: number | null; status: string;
    }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dow = d.getDay();
      const vals = byDow.get(dow) ?? [];
      let forecastPax: number | null = null;
      let status = "ok";
      if (vals.length < 2) {
        status = "insufficient_data";
      } else {
        let wsum = 0;
        let w = 0;
        for (let k = 0; k < vals.length; k++) { wsum += vals[k] * WEIGHTS[k]; w += WEIGHTS[k]; }
        forecastPax = Math.round(wsum / w);
      }
      const suggested = forecastPax != null ? Math.ceil(forecastPax / covers) : null;
      const rostered = rosteredByDate.get(date) ?? 0;
      const delta = suggested != null ? rostered - suggested : null; // negative = short
      days.push({ date, dow, forecastPax, suggested, rostered, delta, status });
    }

    return { data: { outletId, weekStart, coversPerOnDutyStaff: covers, days } };
  }

  async getHeadcountRecommendation(outletId: string, date: string) {
    const forecast = await this.db.query(
      `SELECT hourly_forecasts, daily_summary
       FROM demand_forecasts
       WHERE outlet_id = $1 AND forecast_date = $2
       ORDER BY generated_at DESC LIMIT 1`,
      [outletId, date],
    );

    if (forecast.rows[0]) return { data: forecast.rows[0] };

    // Fallback to historical average
    const historical = await this.db.query(
      `SELECT hour, ROUND(AVG(pax_count)) AS avg_pax
       FROM pax_data
       WHERE outlet_id = $1 AND EXTRACT(DOW FROM date) = EXTRACT(DOW FROM $2::date)
         AND date BETWEEN $2::date - INTERVAL '8 weeks' AND $2::date - INTERVAL '1 day'
       GROUP BY hour ORDER BY hour`,
      [outletId, date],
    );
    return { data: { model: "historical_average", hourly: historical.rows } };
  }
}
