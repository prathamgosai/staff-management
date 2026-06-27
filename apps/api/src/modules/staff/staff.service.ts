import { Injectable, NotFoundException, ConflictException, ForbiddenException, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import type { AuthUser } from "@workforceiq/shared";
import type { CreateStaffDto } from "./dto/create-staff.dto";
import type { UpdateStaffDto } from "./dto/update-staff.dto";
import type { StaffQueryDto } from "./dto/staff-query.dto";

// Fields a non-admin is allowed to change on their OWN profile.
const SELF_EDITABLE_FIELDS = new Set(["phone", "email", "whatsapp"]);

@Injectable()
export class StaffService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async findAll(tenantId: string, query: StaffQueryDto) {
    const { page = 1, limit = 20, search, outletId, status, departmentId, positionId } = query;
    const offset = (page - 1) * limit;
    const conditions: string[] = ["s.tenant_id = $1", "s.employment_status != 'terminated'"];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (search) {
      conditions.push(`(s.name ILIKE $${i} OR s.employee_id ILIKE $${i} OR s.phone ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }
    if (outletId) { conditions.push(`s.current_outlet_id = $${i++}`); params.push(outletId); }
    if (status) { conditions.push(`s.employment_status = $${i++}`); params.push(status); }
    if (departmentId) { conditions.push(`s.department_id = $${i++}`); params.push(departmentId); }
    if (positionId) { conditions.push(`s.position_id = $${i++}`); params.push(positionId); }

    const where = conditions.join(" AND ");
    const [data, count] = await Promise.all([
      this.db.query(
        `SELECT s.id, s.employee_id, s.name, s.phone, s.whatsapp, s.avatar_url,
                s.primary_outlet_id, s.current_outlet_id, s.department_id, s.position_id,
                s.employment_type, s.employment_status, s.join_date,
                d.name AS department_name, p.name AS position_name,
                o.name AS outlet_name
         FROM staff s
         LEFT JOIN departments d ON d.id = s.department_id
         LEFT JOIN positions p ON p.id = s.position_id
         LEFT JOIN outlets o ON o.id = s.current_outlet_id
         WHERE ${where}
         ORDER BY s.name ASC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) FROM staff s WHERE ${where}`, params),
    ]);

    return {
      data: data.rows.map((r) => this.mapRow(r)),
      pagination: {
        page,
        limit,
        total: parseInt(count.rows[0].count),
        totalPages: Math.ceil(parseInt(count.rows[0].count) / limit),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const result = await this.db.query(
      `SELECT s.*, d.name AS department_name, p.name AS position_name,
              o.name AS outlet_name, o.code AS outlet_code
       FROM staff s
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN positions p ON p.id = s.position_id
       LEFT JOIN outlets o ON o.id = s.current_outlet_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [id, tenantId],
    );
    if (!result.rows[0]) throw new NotFoundException(`Staff ${id} not found`);
    return { data: this.mapRow(result.rows[0]) };
  }

  async create(tenantId: string, dto: CreateStaffDto) {
    const empIdResult = await this.db.query(
      "SELECT COUNT(*) FROM staff WHERE tenant_id = $1",
      [tenantId],
    );
    const count = parseInt(empIdResult.rows[0].count) + 1;
    const employeeId = `EMP${String(count).padStart(4, "0")}`;

    const result = await this.db.query(
      `INSERT INTO staff (tenant_id, employee_id, name, phone, email, whatsapp,
        primary_outlet_id, current_outlet_id, department_id, position_id,
        employment_type, employment_status, join_date, base_salary, hourly_rate,
        weekly_hours, overtime_eligible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,'probation',$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        tenantId, employeeId, dto.name, dto.phone, dto.email ?? null, dto.whatsapp ?? null,
        dto.primaryOutletId, dto.departmentId, dto.positionId,
        dto.employmentType, dto.joinDate,
        dto.baseSalary ?? null, dto.hourlyRate ?? null,
        dto.weeklyHours ?? 40, dto.overtimeEligible ?? true,
      ],
    );
    return { data: this.mapRow(result.rows[0]) };
  }

  async update(user: AuthUser, id: string, dto: UpdateStaffDto) {
    const existing = (await this.findOne(user.tenantId, id)).data as { userId?: string | null };
    this.assertCanEditProfile(user, existing, dto);

    const fields = Object.entries(dto)
      .filter(([, v]) => v !== undefined)
      .map(([k], i) => `${this.toSnakeCase(k)} = $${i + 3}`);
    const values = Object.values(dto).filter((v) => v !== undefined);
    if (fields.length === 0) return { data: existing };

    try {
      const result = await this.db.query(
        `UPDATE staff SET ${fields.join(", ")}, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [id, user.tenantId, ...values],
      );
      return { data: result.rows[0] };
    } catch (e) {
      // UNIQUE(tenant_id, employee_id) violation -> friendly 409 instead of 500
      if ((e as { code?: string }).code === "23505") {
        throw new ConflictException("That Employee ID is already in use by another staff member.");
      }
      throw e;
    }
  }

  async updateAvatar(user: AuthUser, id: string, avatarUrl: string | null) {
    const existing = (await this.findOne(user.tenantId, id)).data as { userId?: string | null };
    if (user.role !== "super_admin" && existing.userId !== user.id) {
      throw new ForbiddenException("You can only change your own profile photo.");
    }
    const value = avatarUrl && avatarUrl.trim() ? avatarUrl : null;
    const result = await this.db.query(
      `UPDATE staff SET avatar_url = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, user.tenantId, value],
    );
    return { data: this.mapRow(result.rows[0]) };
  }

  /** super_admin can edit anyone; everyone else may edit only their own contact fields. */
  private assertCanEditProfile(
    user: AuthUser,
    target: { userId?: string | null },
    dto: UpdateStaffDto,
  ) {
    if (user.role === "super_admin") return;
    const isOwnProfile = !!target.userId && target.userId === user.id;
    if (!isOwnProfile) {
      throw new ForbiddenException("You can only edit your own profile.");
    }
    const blocked = Object.keys(dto).filter(
      (k) => (dto as Record<string, unknown>)[k] !== undefined && !SELF_EDITABLE_FIELDS.has(k),
    );
    if (blocked.length > 0) {
      throw new ForbiddenException(
        `You can only update your contact details (phone, email). Not allowed: ${blocked.join(", ")}.`,
      );
    }
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    await this.db.query(
      "UPDATE staff SET employment_status = 'terminated', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
      [id, tenantId],
    );
  }

  async getAttendanceSummary(staffId: string, startDate: string, endDate: string) {
    const result = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'present') AS present_days,
         COUNT(*) FILTER (WHERE status = 'absent') AS absent_days,
         COUNT(*) FILTER (WHERE status = 'late') AS late_days,
         COALESCE(SUM(regular_hours), 0) AS total_regular_hours,
         COALESCE(SUM(overtime_hours), 0) AS total_overtime_hours,
         COALESCE(SUM(late_minutes), 0) AS total_late_minutes
       FROM attendance_records
       WHERE staff_id = $1 AND date BETWEEN $2 AND $3`,
      [staffId, startDate, endDate],
    );
    return { data: result.rows[0] };
  }

  async getLeaveBalances(staffId: string) {
    const result = await this.db.query(
      `SELECT lb.*, lt.name AS leave_type_name, lt.type
       FROM leave_balances lb
       JOIN leave_type_configs lt ON lt.id = lb.leave_type_id
       WHERE lb.staff_id = $1 AND lb.year = EXTRACT(YEAR FROM NOW())
       ORDER BY lt.type`,
      [staffId],
    );
    return { data: result.rows };
  }

  async getSchedule(staffId: string, weekStartDate: string) {
    const result = await this.db.query(
      `SELECT ss.*, sa.status AS assignment_status, s.name AS outlet_name
       FROM shift_assignments sa
       JOIN schedule_shifts ss ON ss.id = sa.shift_id
       JOIN schedules sc ON sc.id = ss.schedule_id
       JOIN outlets s ON s.id = ss.outlet_id
       WHERE sa.staff_id = $1 AND sc.week_start_date = $2
       ORDER BY ss.date, ss.start_time`,
      [staffId, weekStartDate],
    );
    return { data: result.rows };
  }

  private mapRow(row: Record<string, unknown>) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      userId: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      whatsapp: row.whatsapp,
      avatarUrl: row.avatar_url,
      nationalId: row.national_id,
      primaryOutletId: row.primary_outlet_id,
      currentOutletId: row.current_outlet_id,
      departmentId: row.department_id,
      positionId: row.position_id,
      employmentType: row.employment_type,
      employmentStatus: row.employment_status,
      joinDate: row.join_date,
      baseSalary: row.base_salary,
      hourlyRate: row.hourly_rate,
      weeklyHours: row.weekly_hours,
      overtimeEligible: row.overtime_eligible,
      departmentName: row.department_name,
      positionName: row.position_name,
      outletName: row.outlet_name,
      outletCode: row.outlet_code,
    };
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  }
}
