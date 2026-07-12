import { Injectable, Inject, BadRequestException, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { assertOutletAllowed, assertStaffInScope } from "../../common/auth/outlet-scope";
import { NotificationEvent } from "@workforceiq/shared";
import type { AuthUser } from "@workforceiq/shared";
import { NotificationService } from "../notification/notification.service";
import { AuditService } from "../../common/audit/audit.service";
import { toLocalDateStr } from "../../common/utils/week.util";
import { formatError } from "../../common/utils/format-error";

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async getRequests(filters: { tenantId: string; outletFilter?: string[] | null; status?: string; staffId?: string; startDate?: string; endDate?: string }) {
    const { tenantId, outletFilter, status, staffId, startDate, endDate } = filters;
    const conditions = ["s.tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let i = 2;

    // Server-derived outlet scope — null/undefined = every outlet in the tenant.
    conditions.push(`($${i}::uuid[] IS NULL OR s.current_outlet_id = ANY($${i}))`); params.push(outletFilter ?? null); i++;
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

  async applyLeave(body: { staffId: string; leaveTypeId: string; startDate: string; endDate: string; halfDayOption?: string; reason?: string }, scopeUser?: AuthUser) {
    if (scopeUser) await assertStaffInScope(this.db, scopeUser, body.staffId);
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

    const leaveReq = result.rows[0];
    // Notify approvers + confirm to the requester. Fire-and-forget: a notification
    // failure must never fail or slow the leave submission.
    void this.notifyLeaveRequested(leaveReq.id, body);

    return { data: leaveReq };
  }

  async reviewLeave(user: AuthUser, id: string, body: { action: "approve" | "reject"; notes?: string }) {
    const req = await this.db.query("SELECT * FROM leave_requests WHERE id = $1", [id]);
    if (!req.rows[0]) throw new BadRequestException("Leave request not found");
    const leave = req.rows[0];
    await assertStaffInScope(this.db, user, leave.staff_id);
    const reviewerId = user.id;

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

    // Record the decision (who approved/rejected whose leave). Fail-safe.
    await this.audit.record(user, {
      action: `leave.${body.action}`,
      entityType: "leave_request",
      entityId: id,
      newValues: { status: newStatus, staffId: leave.staff_id, notes: body.notes ?? null },
    });

    // Tell the requester the decision (+ the outlet head for coverage planning).
    void this.notifyLeaveDecided(id, leave.staff_id, newStatus, leave, user.id);

    return { data: { id, status: newStatus } };
  }

  async getBalances(staffId: string, scopeUser?: AuthUser) {
    if (scopeUser) await assertStaffInScope(this.db, scopeUser, staffId);
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

  async getCalendar(user: AuthUser, outletId: string, startDate: string, endDate: string) {
    assertOutletAllowed(user, outletId);
    const result = await this.db.query(
      `SELECT lr.staff_id, s.name AS staff_name, lr.start_date, lr.end_date,
              lt.type AS leave_type, lr.status
       FROM leave_requests lr
       JOIN staff s ON s.id = lr.staff_id
       JOIN leave_type_configs lt ON lt.id = lr.leave_type_id
       WHERE s.current_outlet_id = $1 AND s.tenant_id = $4
         AND lr.status IN ('approved','pending')
         AND lr.start_date <= $3 AND lr.end_date >= $2
       ORDER BY lr.start_date`,
      [outletId, startDate, endDate, user.tenantId],
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

  /** Resolve the requester's tenant/outlet/name, then fan out LEAVE_REQUESTED. */
  private async notifyLeaveRequested(
    leaveRequestId: string,
    body: { staffId: string; startDate: string; endDate: string },
  ): Promise<void> {
    try {
      const si = await this.db.query(
        "SELECT tenant_id, current_outlet_id, name FROM staff WHERE id = $1",
        [body.staffId],
      );
      const s = si.rows[0];
      if (!s) return;
      await this.notifications.emit(NotificationEvent.LEAVE_REQUESTED, {
        tenantId: s.tenant_id,
        outletId: s.current_outlet_id,
        leaveRequestId,
        staffId: body.staffId,
        requesterName: s.name,
        startDate: body.startDate,
        endDate: body.endDate,
      });
    } catch (e) {
      this.logger.error(`notifyLeaveRequested failed: ${formatError(e)}`);
    }
  }

  /** Resolve the requester's tenant/outlet, then fan out LEAVE_DECIDED. */
  private async notifyLeaveDecided(
    leaveRequestId: string,
    staffId: string,
    decision: string,
    leave: { start_date: Date | string; end_date: Date | string },
    decidedBy: string,
  ): Promise<void> {
    try {
      const si = await this.db.query(
        "SELECT tenant_id, current_outlet_id FROM staff WHERE id = $1",
        [staffId],
      );
      const s = si.rows[0];
      if (!s) return;
      await this.notifications.emit(NotificationEvent.LEAVE_DECIDED, {
        tenantId: s.tenant_id,
        outletId: s.current_outlet_id,
        leaveRequestId,
        staffId,
        decision: decision === "approved" ? "approved" : "rejected",
        startDate: toLocalDateStr(leave.start_date),
        endDate: toLocalDateStr(leave.end_date),
        decidedBy,
      });
    } catch (e) {
      this.logger.error(`notifyLeaveDecided failed: ${formatError(e)}`);
    }
  }
}
