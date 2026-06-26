import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { DB_POOL } from "../../database/database.module";

@Injectable()
export class ForecastingService {
  private readonly mlServiceUrl: string;

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly config: ConfigService,
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
