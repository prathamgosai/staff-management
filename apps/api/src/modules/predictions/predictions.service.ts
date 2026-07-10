import { Injectable, Inject, BadRequestException, ForbiddenException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { isAdminRole } from "@workforceiq/shared";
import type { AuthUser } from "@workforceiq/shared";
import { RunPredictionDto, UpdateSalariesDto } from "./dto/prediction.dto";
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
      throw new BadRequestException("Provide expected lunch/dinner pax or expected daily pax.");
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

    return positionsRes.rows.map((p) => {
      const ratio = tpl.get(p.id as string) ?? catRatio.get(p.category as string);
      return {
        positionId: p.id as string,
        positionName: p.name as string,
        category: p.category as string,
        guestsPerStaff: ratio ? ratio.g : null,
        minStaff: ratio ? ratio.m : 0,
        avgMonthlySalary: salary.has(p.id as string) ? salary.get(p.id as string)! : null,
      };
    });
  }

  // ── role salaries (admin/hr only) ─────────────────────────────────────────
  private assertSalaryAccess(user: AuthUser) {
    if (!(user.role === "super_admin" || isAdminRole(user.role))) {
      throw new ForbiddenException("Only Admin/HR may view or edit role salaries.");
    }
  }

  async listSalaries(user: AuthUser) {
    this.assertSalaryAccess(user);
    const res = await this.db.query(
      `SELECT p.id AS position_id, p.name AS position_name, p.level, rs.avg_monthly_salary, rs.currency, rs.effective_from
       FROM positions p
       LEFT JOIN LATERAL (
         SELECT avg_monthly_salary, currency, effective_from FROM role_salary_configs rc
         WHERE rc.position_id = p.id AND rc.tenant_id = $1 AND rc.deleted_at IS NULL AND rc.effective_from <= CURRENT_DATE
         ORDER BY rc.effective_from DESC LIMIT 1
       ) rs ON TRUE
       WHERE p.tenant_id = $1 AND p.is_active = true
       ORDER BY p.level DESC, p.name ASC`,
      [user.tenantId],
    );
    return {
      data: res.rows.map((r) => ({
        positionId: r.position_id, positionName: r.position_name, level: r.level,
        avgMonthlySalary: r.avg_monthly_salary === null ? null : Number(r.avg_monthly_salary),
        currency: r.currency ?? "INR", effectiveFrom: r.effective_from,
      })),
    };
  }

  async updateSalaries(user: AuthUser, dto: UpdateSalariesDto) {
    this.assertSalaryAccess(user);
    const rows = dto.salaries ?? [];
    if (rows.length === 0) throw new BadRequestException("Provide at least one salary row.");
    const valid = await this.db.query("SELECT id FROM positions WHERE tenant_id = $1 AND id = ANY($2::uuid[])", [user.tenantId, rows.map((r) => r.positionId)]);
    const validIds = new Set(valid.rows.map((r) => r.id as string));
    for (const r of rows) if (!validIds.has(r.positionId)) throw new BadRequestException("One or more roles are invalid for this tenant.");

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      for (const r of rows) {
        // New effective-dated row per (position, today); re-saving same day updates in place.
        await client.query(
          `INSERT INTO role_salary_configs (tenant_id, position_id, avg_monthly_salary, effective_from, created_by, updated_by)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, $4)
           ON CONFLICT (position_id, effective_from) WHERE deleted_at IS NULL
           DO UPDATE SET avg_monthly_salary = EXCLUDED.avg_monthly_salary, updated_by = EXCLUDED.updated_by`,
          [user.tenantId, r.positionId, r.avgMonthlySalary, user.id],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return this.listSalaries(user);
  }
}
