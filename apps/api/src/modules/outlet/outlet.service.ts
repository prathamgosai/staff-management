import { Injectable, NotFoundException, BadRequestException, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { isAdminRole, type Role } from "@workforceiq/shared";

@Injectable()
export class OutletService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async findAll(tenantId: string, role: Role, outletIds: string[]) {
    const isSuperAdmin = isAdminRole(role);
    const query = isSuperAdmin
      ? `SELECT o.*, b.name AS brand_name, b.logo_url AS brand_logo,
               COUNT(s.id) FILTER (WHERE s.employment_status = 'active') AS active_staff_count
         FROM outlets o
         JOIN brands b ON b.id = o.brand_id
         LEFT JOIN staff s ON s.current_outlet_id = o.id
         WHERE o.tenant_id = $1 AND o.is_active = true
         GROUP BY o.id, b.name, b.logo_url
         ORDER BY b.name, o.name`
      : `SELECT o.*, b.name AS brand_name, b.logo_url AS brand_logo,
               COUNT(s.id) FILTER (WHERE s.employment_status = 'active') AS active_staff_count
         FROM outlets o
         JOIN brands b ON b.id = o.brand_id
         LEFT JOIN staff s ON s.current_outlet_id = o.id
         WHERE o.tenant_id = $1 AND o.is_active = true AND o.id = ANY($2::uuid[])
         GROUP BY o.id, b.name, b.logo_url
         ORDER BY b.name, o.name`;
    const params = isSuperAdmin ? [tenantId] : [tenantId, outletIds];
    const result = await this.db.query(query, params);
    return { data: result.rows };
  }

  async findOne(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT o.*, b.name AS brand_name, b.logo_url AS brand_logo
       FROM outlets o
       JOIN brands b ON b.id = o.brand_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [id, tenantId],
    );
    if (!result.rows[0]) throw new NotFoundException(`Outlet ${id} not found`);
    const departments = await this.db.query(
      "SELECT * FROM departments WHERE outlet_id = $1 ORDER BY sort_order, name",
      [id],
    );
    return { data: { ...result.rows[0], departments: departments.rows } };
  }

  async getHeadcountStatus(outletId: string, date: string) {
    const result = await this.db.query(
      `SELECT
         sc.week_start_date,
         ss.date,
         ss.start_time,
         ss.end_time,
         ss.target_staff,
         ss.min_staff,
         COUNT(sa.id) AS assigned_count,
         CASE WHEN COUNT(sa.id) >= ss.min_staff THEN true ELSE false END AS is_covered,
         CASE WHEN COUNT(sa.id) < ss.target_staff THEN ss.target_staff - COUNT(sa.id) ELSE 0 END AS gap
       FROM schedule_shifts ss
       JOIN schedules sc ON sc.id = ss.schedule_id
       LEFT JOIN shift_assignments sa ON sa.shift_id = ss.id AND sa.status != 'cancelled'
       WHERE ss.outlet_id = $1 AND ss.date = $2 AND sc.status = 'published'
       GROUP BY sc.week_start_date, ss.id
       ORDER BY ss.start_time`,
      [outletId, date],
    );
    return { data: result.rows };
  }

  async getBrands(tenantId: string) {
    const result = await this.db.query(
      "SELECT id, name FROM brands WHERE tenant_id = $1 ORDER BY name",
      [tenantId],
    );
    return { data: result.rows };
  }

  async create(tenantId: string, dto: {
    brandId?: string; brandName?: string; code: string; name: string; type: string;
    address: Record<string, string>; contact: Record<string, string>;
    seatingCapacity?: number;
  }) {
    const client = await (this.db as Pool & { connect(): Promise<{ query: Pool["query"]; release(): void }> }).connect();
    try {
      await client.query("BEGIN");

      // Resolve the brand: use the chosen brandId, or create/reuse one from a
      // typed-in brand name (so a new restaurant brand can be added inline).
      let brandId = dto.brandId;
      if (!brandId) {
        const newName = (dto.brandName ?? "").trim();
        if (!newName) throw new BadRequestException("A brand is required — pick one or enter a new brand name.");
        const existing = await client.query(
          "SELECT id FROM brands WHERE tenant_id = $1 AND lower(name) = lower($2) AND is_active = true LIMIT 1",
          [tenantId, newName],
        );
        if (existing.rows[0]) {
          brandId = existing.rows[0].id;
        } else {
          const ins = await client.query(
            "INSERT INTO brands (tenant_id, name) VALUES ($1, $2) RETURNING id",
            [tenantId, newName],
          );
          brandId = ins.rows[0].id;
        }
      }

      const result = await client.query(
        `INSERT INTO outlets (tenant_id, brand_id, code, name, type, address, contact, seating_capacity, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id, code, name, type, is_active`,
        [
          tenantId, brandId, dto.code.toUpperCase(), dto.name, dto.type,
          JSON.stringify(dto.address), JSON.stringify(dto.contact),
          dto.seatingCapacity ?? null,
        ],
      );

      await client.query("COMMIT");
      return { data: result.rows[0] };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      (client as { release(): void }).release();
    }
  }

  async getLaborCostSummary(outletId: string, startDate: string, endDate: string) {
    const result = await this.db.query(
      `SELECT
         SUM(ar.regular_hours * s.hourly_rate) AS regular_cost,
         SUM(ar.overtime_hours * s.hourly_rate * 1.5) AS overtime_cost,
         SUM((ar.regular_hours + ar.overtime_hours) * s.hourly_rate) AS total_labor_cost,
         SUM(ar.regular_hours + ar.overtime_hours) AS total_hours,
         COUNT(DISTINCT ar.staff_id) AS unique_staff
       FROM attendance_records ar
       JOIN staff s ON s.id = ar.staff_id
       WHERE ar.outlet_id = $1 AND ar.date BETWEEN $2 AND $3`,
      [outletId, startDate, endDate],
    );
    return { data: result.rows[0] };
  }

  async deactivate(tenantId: string, id: string) {
    const result = await this.db.query(
      `UPDATE outlets SET is_active = false
       WHERE id = $1 AND tenant_id = $2 RETURNING id, name`,
      [id, tenantId],
    );
    if (!result.rows[0]) throw new NotFoundException("Outlet not found");
    return { data: result.rows[0] };
  }
}
