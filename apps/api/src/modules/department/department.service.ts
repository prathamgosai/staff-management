import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";

@Injectable()
export class DepartmentService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async getDepartments(outletId: string) {
    const result = await this.db.query(
      `SELECT d.*, COUNT(s.id) AS staff_count
       FROM departments d
       LEFT JOIN staff s ON s.department_id = d.id AND s.employment_status = 'active'
       WHERE d.outlet_id = $1 AND d.is_active = true
       GROUP BY d.id ORDER BY d.sort_order, d.name`,
      [outletId],
    );
    return { data: result.rows };
  }

  async createDepartment(outletId: string, name: string) {
    const result = await this.db.query(
      "INSERT INTO departments (outlet_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *",
      [outletId, name],
    );
    return { data: result.rows[0] };
  }

  async deleteDepartment(id: string): Promise<void> {
    await this.db.query("UPDATE departments SET is_active = false WHERE id = $1", [id]);
  }

  async getPositions(tenantId: string) {
    const result = await this.db.query(
      "SELECT * FROM positions WHERE tenant_id = $1 AND is_active = true ORDER BY level DESC, name",
      [tenantId],
    );
    return { data: result.rows };
  }

  async createPosition(tenantId: string, body: { name: string; level?: number; defaultHoursWeek?: number }) {
    const result = await this.db.query(
      "INSERT INTO positions (tenant_id, name, level, default_hours_week) VALUES ($1,$2,$3,$4) RETURNING *",
      [tenantId, body.name, body.level ?? 1, body.defaultHoursWeek ?? 40],
    );
    return { data: result.rows[0] };
  }

  // ── Role playbook: SOPs + KPIs, authored per position ──────────────────────
  /**
   * The SOPs and KPIs for one position. Staff inherit these via their position_id
   * rather than owning copies — 248 staff share 13 roles.
   *
   * One round trip for both lists: the DB is remote and round-trips dominate latency.
   */
  async getPlaybook(tenantId: string, positionId: string) {
    const pos = await this.db.query(
      "SELECT id, name FROM positions WHERE id = $1 AND tenant_id = $2",
      [positionId, tenantId],
    );
    if (!pos.rows[0]) throw new NotFoundException("Position not found");

    const [sops, kpis] = await Promise.all([
      this.db.query(
        `SELECT * FROM position_sops
          WHERE position_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
          ORDER BY sort_order, name`,
        [positionId, tenantId],
      ),
      this.db.query(
        `SELECT * FROM position_kpis
          WHERE position_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
          ORDER BY sort_order, name`,
        [positionId, tenantId],
      ),
    ]);

    return {
      data: {
        position: { id: pos.rows[0].id, name: pos.rows[0].name },
        sops: sops.rows.map((r) => ({
          id: r.id, name: r.name, purpose: r.purpose, inputs: r.inputs,
          procedureSteps: r.procedure_steps ?? [], qualityChecks: r.quality_checks ?? [],
          commonMistakes: r.common_mistakes ?? [], exceptionsEscalation: r.exceptions_escalation,
          documentation: r.documentation, frequency: r.frequency, timeTarget: r.time_target,
          ownerLabel: r.owner_label, isDraft: r.is_draft, sortOrder: r.sort_order,
        })),
        kpis: kpis.rows.map((r) => ({
          id: r.id, name: r.name, definition: r.definition, formula: r.formula,
          targetValue: r.target_value, measurementFrequency: r.measurement_frequency,
          dataSource: r.data_source, ownerLabel: r.owner_label,
          reportingFormat: r.reporting_format, belowTargetAction: r.below_target_action,
          category: r.category, isMeasurableToday: r.is_measurable_today,
          isDraft: r.is_draft, sortOrder: r.sort_order,
        })),
      },
    };
  }

  /** Mark a seeded draft as reviewed once a manager has corrected it to real practice. */
  async approveSop(tenantId: string, sopId: string, userId: string) {
    const r = await this.db.query(
      `UPDATE position_sops SET is_draft = FALSE, updated_by = $3, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING id`,
      [sopId, tenantId, userId],
    );
    if (!r.rows[0]) throw new NotFoundException("SOP not found");
    return { data: { id: sopId, isDraft: false } };
  }
}
