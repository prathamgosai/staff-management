import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";
import { resolveOutletFilter } from "../../common/auth/outlet-scope";
import type { AuthUser } from "@workforceiq/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** RFC-4180-ish CSV: quote a field only when it contains a comma, quote, or newline. */
function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: unknown[][]): string {
  // Leading UTF-8 BOM so Excel reads non-ASCII names correctly.
  return "﻿" + rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

@Injectable()
export class ReportsService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  private range(startDate: string, endDate: string): void {
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      throw new BadRequestException("startDate and endDate are required as YYYY-MM-DD.");
    }
    if (startDate > endDate) throw new BadRequestException("startDate must not be after endDate.");
  }

  /**
   * Per-employee payroll summary for a period: days present, total regular/overtime hours,
   * and computed pay (regular = hours x rate; overtime = hours x rate x 1.5). Tenant-scoped;
   * an out-of-scope outletId is rejected (403). Aggregated across the caller's in-scope
   * outlets, labelled by the staff member's current outlet.
   */
  async payrollSummaryCsv(
    user: AuthUser,
    q: { outletId?: string; startDate: string; endDate: string },
  ): Promise<{ filename: string; csv: string }> {
    this.range(q.startDate, q.endDate);
    const scope = resolveOutletFilter(user, q.outletId);
    const res = await this.db.query(
      `SELECT s.employee_id, s.name, o.name AS outlet_name, COALESCE(s.hourly_rate, 0) AS hourly_rate,
              COUNT(*) FILTER (WHERE ar.status IN ('present','late','early_departure')) AS days_present,
              COALESCE(SUM(ar.regular_hours), 0)  AS regular_hours,
              COALESCE(SUM(ar.overtime_hours), 0) AS overtime_hours
       FROM staff s
       JOIN attendance_records ar ON ar.staff_id = s.id
       LEFT JOIN outlets o ON o.id = s.current_outlet_id
       WHERE s.tenant_id = $1 AND ar.date BETWEEN $2 AND $3
         AND ($4::uuid[] IS NULL OR ar.outlet_id = ANY($4))
       GROUP BY s.id, s.employee_id, s.name, o.name, s.hourly_rate
       ORDER BY o.name NULLS LAST, s.name`,
      [user.tenantId, q.startDate, q.endDate, scope],
    );

    const header = [
      "Employee ID", "Name", "Outlet", "Days Present", "Regular Hours", "Overtime Hours",
      "Hourly Rate", "Regular Pay", "Overtime Pay", "Total Pay",
    ];
    const body = res.rows.map((r) => {
      const reg = Number(r.regular_hours);
      const ot = Number(r.overtime_hours);
      const rate = Number(r.hourly_rate);
      const regPay = reg * rate;
      const otPay = ot * rate * 1.5;
      return [
        r.employee_id, r.name, r.outlet_name ?? "", Number(r.days_present),
        reg.toFixed(2), ot.toFixed(2), rate.toFixed(2), regPay.toFixed(2), otPay.toFixed(2), (regPay + otPay).toFixed(2),
      ];
    });
    return { filename: `payroll-summary_${q.startDate}_to_${q.endDate}.csv`, csv: toCsv([header, ...body]) };
  }

  /** Detailed attendance export — one row per attendance record in the period + scope. */
  async attendanceCsv(
    user: AuthUser,
    q: { outletId?: string; startDate: string; endDate: string },
  ): Promise<{ filename: string; csv: string }> {
    this.range(q.startDate, q.endDate);
    const scope = resolveOutletFilter(user, q.outletId);
    const res = await this.db.query(
      `SELECT ar.date, s.employee_id, s.name, o.name AS outlet_name, ar.status,
              ar.clock_in, ar.clock_out, ar.break_minutes, ar.regular_hours, ar.overtime_hours,
              ar.late_minutes, ar.early_departure_minutes
       FROM attendance_records ar
       JOIN staff s ON s.id = ar.staff_id
       JOIN outlets o ON o.id = ar.outlet_id
       WHERE s.tenant_id = $1 AND ar.date BETWEEN $2 AND $3
         AND ($4::uuid[] IS NULL OR ar.outlet_id = ANY($4))
       ORDER BY ar.date, o.name, s.name`,
      [user.tenantId, q.startDate, q.endDate, scope],
    );

    const header = [
      "Date", "Employee ID", "Name", "Outlet", "Status", "Clock In", "Clock Out",
      "Break (min)", "Regular Hours", "Overtime Hours", "Late (min)", "Early Departure (min)",
    ];
    const iso = (v: unknown): string => (v ? new Date(v as string).toISOString() : "");
    const body = res.rows.map((r) => [
      r.date, r.employee_id, r.name, r.outlet_name, r.status,
      iso(r.clock_in), iso(r.clock_out), Number(r.break_minutes ?? 0),
      Number(r.regular_hours), Number(r.overtime_hours), Number(r.late_minutes ?? 0), Number(r.early_departure_minutes ?? 0),
    ]);
    return { filename: `attendance_${q.startDate}_to_${q.endDate}.csv`, csv: toCsv([header, ...body]) };
  }
}
