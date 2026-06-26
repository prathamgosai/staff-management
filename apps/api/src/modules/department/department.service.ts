import { Injectable, Inject } from "@nestjs/common";
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
}
