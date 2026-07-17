import { Injectable, NotFoundException, BadRequestException, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { isAdminRole, type Role, type AuthUser } from "@workforceiq/shared";
import { assertOutletAllowed, assertOutletInScope } from "../../common/auth/outlet-scope";

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

  async findOne(user: AuthUser, id: string) {
    await assertOutletInScope(this.db, user, id); // tenant + outlet scope (404 out-of-scope)
    const result = await this.db.query(
      `SELECT o.*, b.name AS brand_name, b.logo_url AS brand_logo
       FROM outlets o
       JOIN brands b ON b.id = o.brand_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [id, user.tenantId],
    );
    if (!result.rows[0]) throw new NotFoundException(`Outlet ${id} not found`);
    const departments = await this.db.query(
      "SELECT * FROM departments WHERE outlet_id = $1 ORDER BY sort_order, name",
      [id],
    );
    return { data: { ...result.rows[0], departments: departments.rows } };
  }

  /** Set an outlet's capacity (tables / max pax). NULL max_pax = excluded from the model. */
  async updateCapacity(
    user: AuthUser,
    id: string,
    body: { totalTables?: number | null; maxPax?: number | null },
  ) {
    assertOutletAllowed(user, id); // 403 if out of scope (admins bypass)

    const clean = (v: number | null | undefined, label: string): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
        throw new BadRequestException(`${label} must be a non-negative whole number.`);
      }
      return v;
    };

    const sets: string[] = [];
    const params: unknown[] = [id, user.tenantId];
    let i = 3;
    if (body.totalTables !== undefined) { sets.push(`total_tables = $${i++}`); params.push(clean(body.totalTables, "Total tables")); }
    if (body.maxPax !== undefined) { sets.push(`max_pax = $${i++}`); params.push(clean(body.maxPax, "Max pax")); }
    if (sets.length === 0) throw new BadRequestException("Provide totalTables and/or maxPax.");

    const result = await this.db.query(
      `UPDATE outlets SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, code, name, total_tables, max_pax`,
      params,
    );
    if (!result.rows[0]) throw new NotFoundException("Outlet not found");
    return { data: result.rows[0] };
  }

  /**
   * Set (or clear) an outlet's GPS coordinates and geofence radius.
   *
   * Until this is set, an outlet's punches record geo_status='not_evaluated' — the geofence
   * has nothing to measure against. Coordinates are entered by a human (paste from Google
   * Maps, or capture on-site); we deliberately don't geocode the stored address, because a
   * street-level guess that lands 200m out silently sends real staff to review.
   */
  async updateLocation(
    user: AuthUser,
    id: string,
    body: { latitude?: number | null; longitude?: number | null; geofenceRadiusM?: number },
  ) {
    assertOutletAllowed(user, id); // 403 if out of scope (admins bypass)

    const { latitude, longitude, geofenceRadiusM } = body;
    const settingLat = latitude !== undefined;
    const settingLng = longitude !== undefined;
    // A latitude without a longitude is not a location. The DB enforces this too, but a
    // clear 400 beats a constraint violation surfacing as a 500.
    if (settingLat !== settingLng) {
      throw new BadRequestException("Provide latitude and longitude together.");
    }
    if (settingLat && (latitude === null) !== (longitude === null)) {
      throw new BadRequestException("Provide both latitude and longitude, or null for both to clear the geofence.");
    }

    const sets: string[] = [];
    const params: unknown[] = [id, user.tenantId];
    let i = 3;
    if (settingLat) {
      sets.push(`latitude = $${i++}`, `longitude = $${i++}`);
      params.push(latitude, longitude);
      // Record who pinned it and when — a wrong coordinate blocks real staff, so it needs
      // to be traceable to a person.
      sets.push(`location_set_by = $${i++}`, "location_set_at = NOW()");
      params.push(user.id);
    }
    if (geofenceRadiusM !== undefined) { sets.push(`geofence_radius_m = $${i++}`); params.push(geofenceRadiusM); }
    if (sets.length === 0) throw new BadRequestException("Provide latitude+longitude and/or geofenceRadiusM.");

    const result = await this.db.query(
      `UPDATE outlets SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, code, name, latitude, longitude, geofence_radius_m, location_set_at`,
      params,
    );
    if (!result.rows[0]) throw new NotFoundException("Outlet not found");
    return { data: result.rows[0] };
  }

  async getHeadcountStatus(user: AuthUser, outletId: string, date: string) {
    await assertOutletInScope(this.db, user, outletId); // was queried by raw outletId, no tenant filter
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

  async getLaborCostSummary(user: AuthUser, outletId: string, startDate: string, endDate: string) {
    await assertOutletInScope(this.db, user, outletId); // was queried by raw outletId, no tenant filter
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
