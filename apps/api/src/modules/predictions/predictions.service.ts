import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { allowedOutletIds } from "../../common/auth/outlet-scope";
import type { AuthUser } from "@workforceiq/shared";
import { RunPredictionDto } from "./dto/prediction.dto";
import { RatioBasedStrategy, PredictionStrategy, RoleRatio, effectivePaxFromInputs } from "./prediction-strategy";

/**
 * Staff Predictor (Feature 5). Resolves each role's ratio (category template → company category
 * default) and average salary, runs a pluggable PredictionStrategy (v1 = RatioBasedStrategy), and
 * persists every run (inputs+outputs+strategy_version) to staff_predictions for future training.
 * Role-salary management is admin/hr only.
 */
@Injectable()
export class PredictionsService {
  private readonly strategy: PredictionStrategy = new RatioBasedStrategy();

  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async run(user: AuthUser, dto: RunPredictionDto) {
    if (effectivePaxFromInputs(dto) <= 0) {
      // Seating counts too — it falls back to a pax estimate (see resolveEffectivePax).
      throw new BadRequestException("Enter expected lunch/dinner pax, daily pax, or total seating.");
    }
    const roles = await this.resolveRoles(user.tenantId, dto.categoryName);
    const outputs = this.strategy.predict(dto, roles);

    const saved = await this.db.query(
      `INSERT INTO staff_predictions (tenant_id, inputs, outputs, strategy_version, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [user.tenantId, JSON.stringify(dto), JSON.stringify(outputs), outputs.strategyVersion, user.id],
    );
    return { data: { id: saved.rows[0].id, createdAt: saved.rows[0].created_at, ...outputs } };
  }

  /**
   * Existing outlets the predictor can be measured against: their configured peak covers,
   * their category, and how many staff they ACTUALLY employ today.
   *
   * This is what turns the page from a calculator into a planning tool — "required" means
   * little until you can see it beside the headcount you really run. Only outlets with a
   * category and a peak-pax figure appear; the rest have nothing to compare against, and a
   * guessed baseline would be worse than an absent one.
   */
  async outletBaselines(user: AuthUser) {
    const scope = allowedOutletIds(user);
    const res = await this.db.query(
      `SELECT o.id, o.name AS outlet_name, rc.name AS category_name,
              cfg.peak_pax, cfg.avg_daily_pax,
              COUNT(s.id) FILTER (WHERE s.employment_status = 'active')::int AS actual_staff,
              EXISTS (SELECT 1 FROM ratio_templates rt WHERE rt.category_id = cfg.category_id) AS category_calibrated
         FROM restaurant_configurations cfg
         JOIN outlets o ON o.id = cfg.outlet_id AND o.is_active = TRUE
         LEFT JOIN restaurant_categories rc ON rc.id = cfg.category_id
         LEFT JOIN staff s ON s.current_outlet_id = o.id
        WHERE o.tenant_id = $1
          AND cfg.peak_pax > 0
          AND ($2::uuid[] IS NULL OR o.id = ANY($2))
        GROUP BY o.id, o.name, rc.name, cfg.peak_pax, cfg.avg_daily_pax, cfg.category_id
        ORDER BY rc.name NULLS LAST, o.name`,
      [user.tenantId, scope],
    );
    return {
      data: res.rows.map((r) => ({
        outletId: r.id,
        outletName: r.outlet_name,
        categoryName: r.category_name,
        peakPax: Number(r.peak_pax),
        avgDailyPax: r.avg_daily_pax == null ? null : Number(r.avg_daily_pax),
        actualStaff: Number(r.actual_staff),
        categoryCalibrated: !!r.category_calibrated,
      })),
    };
  }

  async history(user: AuthUser) {
    const res = await this.db.query(
      `SELECT sp.id, sp.inputs, sp.outputs, sp.strategy_version, sp.created_at, u.name AS created_by_name
       FROM staff_predictions sp LEFT JOIN users u ON u.id = sp.created_by
       WHERE sp.tenant_id = $1 AND sp.deleted_at IS NULL
       ORDER BY sp.created_at DESC LIMIT 50`,
      [user.tenantId],
    );
    return {
      data: res.rows.map((r) => ({
        id: r.id, inputs: r.inputs, outputs: r.outputs, strategyVersion: r.strategy_version,
        createdAt: r.created_at, createdByName: r.created_by_name,
      })),
    };
  }

  /** Build the per-role ratio + salary inputs for the strategy. */
  private async resolveRoles(tenantId: string, categoryName?: string): Promise<RoleRatio[]> {
    let categoryId: string | null = null;
    if (categoryName) {
      const cat = await this.db.query(
        "SELECT id FROM restaurant_categories WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL",
        [tenantId, categoryName],
      );
      categoryId = cat.rows[0]?.id ?? null;
    }

    const [positionsRes, tplRes, catRatioRes, salaryRes] = await Promise.all([
      this.db.query(
        `SELECT p.id, p.name, COALESCE(pcm.category, 'General') AS category
         FROM positions p
         LEFT JOIN post_category_map pcm ON pcm.tenant_id = p.tenant_id AND LOWER(pcm.post) = LOWER(p.name)
         WHERE p.tenant_id = $1 AND p.is_active = true`,
        [tenantId],
      ),
      categoryId
        ? this.db.query("SELECT position_id, guests_per_staff, min_staff FROM ratio_templates WHERE tenant_id = $1 AND category_id = $2 AND deleted_at IS NULL", [tenantId, categoryId])
        : Promise.resolve({ rows: [] as { position_id: string; guests_per_staff: number; min_staff: number }[] }),
      this.db.query("SELECT category, pax_per_staff, min_staff FROM staffing_ratios WHERE tenant_id = $1", [tenantId]),
      this.db.query(
        `SELECT DISTINCT ON (position_id) position_id, avg_monthly_salary
         FROM role_salary_configs
         WHERE tenant_id = $1 AND deleted_at IS NULL AND effective_from <= CURRENT_DATE
         ORDER BY position_id, effective_from DESC`,
        [tenantId],
      ),
    ]);

    const tpl = new Map<string, { g: number; m: number }>(tplRes.rows.map((r) => [r.position_id as string, { g: Number(r.guests_per_staff), m: Number(r.min_staff) }]));
    const catRatio = new Map<string, { g: number; m: number }>(catRatioRes.rows.map((r) => [r.category as string, { g: Number(r.pax_per_staff), m: Number(r.min_staff) }]));
    const salary = new Map<string, number>(salaryRes.rows.map((r) => [r.position_id as string, Number(r.avg_monthly_salary)]));

    // A CALIBRATED category (has ≥1 ratio_template row) is sized PER-ROLE from its template only.
    // It must NOT also fall back to the company category default, because that default is a
    // per-CATEGORY figure and the strategy sums per POSITION — applying it to each position in a
    // staff-category multiplies the requirement ~Nx (the same over-count fixed in StaffingService).
    if (tpl.size > 0) {
      return positionsRes.rows.map((p) => {
        const t = tpl.get(p.id as string);
        return {
          positionId: p.id as string,
          positionName: p.name as string,
          category: p.category as string,
          guestsPerStaff: t ? t.g : null,
          minStaff: t ? t.m : 0,
          avgMonthlySalary: salary.has(p.id as string) ? salary.get(p.id as string)! : null,
        };
      });
    }

    // UNCALIBRATED (no category, or a category with no templates yet): estimate from the company
    // seating ratios (staffing_ratios) applied ONCE per staff-category — the same basis as the
    // new-outlet planner — instead of per position. This keeps the total sane (no over-count) and
    // never 500s on a category that simply has no per-role template configured.
    return [...catRatio.entries()].map(([category, r]) => ({
      positionId: `catdef:${category}`,
      positionName: `${category} (company default)`,
      category,
      guestsPerStaff: r.g,
      minStaff: r.m,
      avgMonthlySalary: null,
    }));
  }

}
