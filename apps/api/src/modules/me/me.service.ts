import {
  Injectable, Inject, NotFoundException, ForbiddenException,
  ConflictException, BadRequestException,
} from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { LeaveService } from "../leave/leave.service";
import { getMondayStr, toLocalDateStr } from "../../common/utils/week.util";
import type { AuthUser } from "@workforceiq/shared";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { CreateLeaveRequestDto } from "./dto/create-leave-request.dto";

/**
 * Self-service ("/me") data. EVERY method scopes strictly to the caller's own
 * staff record, resolved from req.user.id via staff.user_id. Nothing here ever
 * trusts a client-supplied staffId / outletId.
 */
@Injectable()
export class MeService {
  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly leaveService: LeaveService,
  ) {}

  /** Resolve the caller's OWN staff id. Throws if their login isn't linked to a staff record. */
  private async getStaffId(user: AuthUser): Promise<string> {
    const res = await this.db.query(
      "SELECT id FROM staff WHERE user_id = $1 AND tenant_id = $2",
      [user.id, user.tenantId],
    );
    if (!res.rows[0]) {
      throw new NotFoundException("No staff profile is linked to your account.");
    }
    return res.rows[0].id as string;
  }

  async getProfile(user: AuthUser) {
    const res = await this.db.query(
      `SELECT s.id, s.employee_id, s.name, s.email, s.phone, s.whatsapp,
              s.avatar_url, s.emergency_contact,
              s.employment_type, s.employment_status, s.join_date,
              o.name AS outlet_name, d.name AS department_name, p.name AS position_name
       FROM staff s
       LEFT JOIN outlets o ON o.id = s.current_outlet_id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN positions p ON p.id = s.position_id
       WHERE s.user_id = $1 AND s.tenant_id = $2`,
      [user.id, user.tenantId],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException("No staff profile is linked to your account.");

    // Safe projection only — never salary, national id, passport, bank details,
    // and (from a different table entirely) never password/refresh-token fields.
    return {
      data: {
        id: row.id,
        employeeId: row.employee_id,
        name: row.name,
        email: row.email,
        role: user.role,
        phone: row.phone,
        whatsapp: row.whatsapp,
        avatarUrl: row.avatar_url,
        emergencyContact: row.emergency_contact,
        outletName: row.outlet_name,
        departmentName: row.department_name,
        positionName: row.position_name,
        employmentType: row.employment_type,
        employmentStatus: row.employment_status,
        joinDate: row.join_date,
      },
    };
  }

  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    // Whitelist: ONLY phone, emergency contact, photo. The WHERE clause pins the
    // update to the caller's OWN row, so there is no id to tamper with.
    const sets: string[] = [];
    const params: unknown[] = [user.id, user.tenantId];
    let i = 3;
    if (dto.phone !== undefined) {
      sets.push(`phone = $${i++}`);
      params.push(dto.phone);
    }
    if (dto.emergencyContact !== undefined) {
      // Merge the provided keys over any existing contact so a partial payload
      // (e.g. just a new phone) never wipes the other fields.
      sets.push(`emergency_contact = COALESCE(emergency_contact, '{}'::jsonb) || $${i++}::jsonb`);
      params.push(JSON.stringify(dto.emergencyContact));
    }
    if (dto.avatarUrl !== undefined) {
      sets.push(`avatar_url = $${i++}`);
      params.push(dto.avatarUrl.trim() ? dto.avatarUrl : null);
    }
    if (sets.length === 0) return this.getProfile(user);

    await this.db.query(
      `UPDATE staff SET ${sets.join(", ")}, updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2`,
      params,
    );
    return this.getProfile(user);
  }

  async getShifts(user: AuthUser, week?: string) {
    if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
      throw new BadRequestException("week must be in YYYY-MM-DD format");
    }
    const staffId = await this.getStaffId(user);
    // Normalise whatever day the client sent to its local Monday — the shared,
    // canonical week key. Never trust the client to pre-round it.
    const weekStartDate = getMondayStr(week ? new Date(`${week}T00:00:00`) : new Date());

    const res = await this.db.query(
      `SELECT ss.id AS shift_id, ss.date, ss.start_time, ss.end_time, ss.is_overnight,
              st.name AS shift_name, st.color AS shift_color,
              o.id AS outlet_id, o.name AS outlet_name
       FROM shift_assignments sa
       JOIN schedule_shifts ss ON ss.id = sa.shift_id
       JOIN schedules sc ON sc.id = ss.schedule_id
       LEFT JOIN shift_templates st ON st.id = ss.template_id
       LEFT JOIN outlets o ON o.id = ss.outlet_id
       WHERE sa.staff_id = $1 AND sa.status <> 'cancelled'
         AND sc.week_start_date = $2
       ORDER BY ss.date, ss.start_time`,
      [staffId, weekStartDate],
    );

    const shifts = res.rows.map((r: Record<string, unknown>) => ({
      shiftId: r.shift_id,
      date: toLocalDateStr(r.date as Date | string),
      startTime: r.start_time,
      endTime: r.end_time,
      isOvernight: r.is_overnight,
      shiftName: r.shift_name,
      shiftColor: r.shift_color,
      outletId: r.outlet_id,
      outletName: r.outlet_name,
    }));
    return { data: { weekStartDate, shifts } };
  }

  async getAttendance(user: AuthUser, month?: string) {
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException("month must be in YYYY-MM format");
    }
    const staffId = await this.getStaffId(user);
    const now = new Date();
    const monthKey = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = `${monthKey}-01`;

    const [records, summary] = await Promise.all([
      this.db.query(
        `SELECT id, date, clock_in, clock_out, status,
                regular_hours, overtime_hours, late_minutes, notes
         FROM attendance_records
         WHERE staff_id = $1 AND date >= $2::date AND date < ($2::date + INTERVAL '1 month')
         ORDER BY date DESC`,
        [staffId, monthStart],
      ),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'present') AS present_days,
           COUNT(*) FILTER (WHERE status = 'absent') AS absent_days,
           COUNT(*) FILTER (WHERE status = 'late') AS late_days,
           COUNT(*) FILTER (WHERE status = 'on_leave') AS on_leave_days,
           COALESCE(SUM(regular_hours), 0) AS total_regular_hours,
           COALESCE(SUM(overtime_hours), 0) AS total_overtime_hours,
           COALESCE(SUM(late_minutes), 0) AS total_late_minutes
         FROM attendance_records
         WHERE staff_id = $1 AND date >= $2::date AND date < ($2::date + INTERVAL '1 month')`,
        [staffId, monthStart],
      ),
    ]);

    const rows = records.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      date: toLocalDateStr(r.date as Date | string),
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      status: r.status,
      regularHours: r.regular_hours,
      overtimeHours: r.overtime_hours,
      lateMinutes: r.late_minutes,
      notes: r.notes,
    }));
    return { data: { month: monthKey, summary: summary.rows[0], records: rows } };
  }

  async getLeave(user: AuthUser) {
    const staffId = await this.getStaffId(user);
    const [balances, requests, types] = await Promise.all([
      this.leaveService.getBalances(staffId),
      this.leaveService.getRequests({ tenantId: user.tenantId, staffId }),
      this.leaveService.getLeaveTypes(user.tenantId),
    ]);
    return { data: { balances: balances.data, requests: requests.data, types: types.data } };
  }

  async createLeaveRequest(user: AuthUser, dto: CreateLeaveRequestDto) {
    const staffId = await this.getStaffId(user);
    // Reuse the leave module's validated apply flow (balance check + pending
    // accrual). staffId ALWAYS comes from the token, never the request body.
    return this.leaveService.applyLeave({
      staffId,
      leaveTypeId: dto.leaveTypeId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      halfDayOption: dto.halfDayOption,
      reason: dto.reason,
    });
  }

  async cancelLeaveRequest(user: AuthUser, id: string) {
    const staffId = await this.getStaffId(user);
    const res = await this.db.query(
      "SELECT staff_id, status FROM leave_requests WHERE id = $1",
      [id],
    );
    const req = res.rows[0];
    if (!req) throw new NotFoundException("Leave request not found.");
    if (req.staff_id !== staffId) {
      throw new ForbiddenException("You can only cancel your own leave requests.");
    }
    if (req.status !== "pending") {
      throw new ConflictException("Only pending leave requests can be cancelled.");
    }

    // Atomic flip: guarded by staff_id + status='pending' so two concurrent
    // cancels can never both succeed and double-release the balance.
    const upd = await this.db.query(
      `UPDATE leave_requests SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND staff_id = $2 AND status = 'pending'
       RETURNING leave_type_id, total_days`,
      [id, staffId],
    );
    if (upd.rowCount === 0) {
      throw new ConflictException("Only pending leave requests can be cancelled.");
    }

    // Release the pending hold this request placed on the balance.
    await this.db.query(
      `UPDATE leave_balances SET pending = GREATEST(0, pending - $3)
       WHERE staff_id = $1 AND leave_type_id = $2 AND year = EXTRACT(YEAR FROM NOW())`,
      [staffId, upd.rows[0].leave_type_id, upd.rows[0].total_days],
    );
    return { data: { id, status: "cancelled" } };
  }
}
