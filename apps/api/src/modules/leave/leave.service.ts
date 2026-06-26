import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";

@Injectable()
export class LeaveService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async getRequests(filters: { tenantId: string; outletId?: string; status?: string; staffId?: string; startDate?: string; endDate?: string }) {
    const { tenantId, outletId, status, staffId, startDate, endDate } = filters;
    const conditions = ["s.tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (outletId) { conditions.push(`s.current_outlet_id = $${i++}`); params.push(outletId); }
    if (status) { conditions.push(`lr.status = $${i++}`); params.push(status); }
    if (staffId) { conditions.push(`lr.staff_id = $${i++}`); params.push(staffId); }
    if (startDate && endDate) {
      conditions.push(`lr.start_date <= $${i++} AND lr.end_date >= $${i++}`);
      params.push(endDate, startDate);
    }

    const result = await this.db.query(
      `SELECT lr.*, s.name AS staff_name, s.employee_id, lt.name AS leave_type_name, lt.type
       FROM leave_requests lr
       JOIN staff s ON s.id = lr.staff_id
       JOIN leave_type_configs lt ON lt.id = lr.leave_type_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY lr.applied_at DESC
       LIMIT 100`,
      params,
    );
    return { data: result.rows };
  }

  async applyLeave(body: { staffId: string; leaveTypeId: string; startDate: string; endDate: string; halfDayOption?: string; reason?: string }) {
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    const totalDays = (end.getTime() - start.getTime()) / 86400000 + 1;

    // Check balance — skip if no balance record exists (entitlement not yet configured)
    const balanceResult = await this.db.query(
      `SELECT entitlement - taken - pending AS available
       FROM leave_balances
       WHERE staff_id = $1 AND leave_type_id = $2 AND year = EXTRACT(YEAR FROM NOW())`,
      [body.staffId, body.leaveTypeId],
    );
    if (balanceResult.rows.length > 0) {
      const available = parseFloat(balanceResult.rows[0]?.available ?? "0");
      if (available < totalDays) throw new BadRequestException(`Insufficient leave balance. Available: ${available} day(s)`);
    }

    const result = await this.db.query(
      `INSERT INTO leave_requests (staff_id, leave_type_id, start_date, end_date, total_days, half_day_option, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [body.staffId, body.leaveTypeId, body.startDate, body.endDate, totalDays, body.halfDayOption ?? null, body.reason ?? null],
    );

    await this.db.query(
      `UPDATE leave_balances SET pending = pending + $3
       WHERE staff_id = $1 AND leave_type_id = $2 AND year = EXTRACT(YEAR FROM NOW())`,
      [body.staffId, body.leaveTypeId, totalDays],
    );

    return { data: result.rows[0] };
  }

  async reviewLeave(id: string, reviewerId: string, body: { action: "approve" | "reject"; notes?: string }) {
    const req = await this.db.query("SELECT * FROM leave_requests WHERE id = $1", [id]);
    if (!req.rows[0]) throw new BadRequestException("Leave request not found");
    const leave = req.rows[0];

    const newStatus = body.action === "approve" ? "approved" : "rejected";
    await this.db.query(
      `UPDATE leave_requests SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_notes = $4 WHERE id = $1`,
      [id, newStatus, reviewerId, body.notes ?? null],
    );

    if (body.action === "approve") {
      await this.db.query(
        `UPDATE leave_balances SET taken = taken + $3, pending = GREATEST(0, pending - $3)
         WHERE staff_id = $1 AND leave_type_id = $2 AND year = EXTRACT(YEAR FROM NOW())`,
        [leave.staff_id, leave.leave_type_id, leave.total_days],
      );
    } else {
      await this.db.query(
        `UPDATE leave_balances SET pending = GREATEST(0, pending - $3)
         WHERE staff_id = $1 AND leave_type_id = $2 AND year = EXTRACT(YEAR FROM NOW())`,
        [leave.staff_id, leave.leave_type_id, leave.total_days],
      );
    }

    return { data: { id, status: newStatus } };
  }

  async getBalances(staffId: string) {
    const result = await this.db.query(
      `SELECT lb.*, lt.name, lt.type, lt.annual_entitlement,
              lb.entitlement - lb.taken AS balance
       FROM leave_balances lb
       JOIN leave_type_configs lt ON lt.id = lb.leave_type_id
       WHERE lb.staff_id = $1 AND lb.year = EXTRACT(YEAR FROM NOW())`,
      [staffId],
    );
    return { data: result.rows };
  }

  async getCalendar(outletId: string, startDate: string, endDate: string) {
    const result = await this.db.query(
      `SELECT lr.staff_id, s.name AS staff_name, lr.start_date, lr.end_date,
              lt.type AS leave_type, lr.status
       FROM leave_requests lr
       JOIN staff s ON s.id = lr.staff_id
       JOIN leave_type_configs lt ON lt.id = lr.leave_type_id
       WHERE s.current_outlet_id = $1
         AND lr.status IN ('approved','pending')
         AND lr.start_date <= $3 AND lr.end_date >= $2
       ORDER BY lr.start_date`,
      [outletId, startDate, endDate],
    );
    return { data: result.rows };
  }

  async getLeaveTypes(tenantId: string) {
    const result = await this.db.query(
      "SELECT * FROM leave_type_configs WHERE tenant_id = $1 AND is_active = true ORDER BY type",
      [tenantId],
    );
    return { data: result.rows };
  }
}
