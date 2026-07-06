import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";

@Injectable()
export class DashboardService {
  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  async getOverview(tenantId: string) {
    const [outlets, staff, activeLeave, todayAttendance] = await Promise.all([
      this.db.query("SELECT COUNT(*) FROM outlets WHERE tenant_id = $1 AND is_active = true", [tenantId]),
      this.db.query("SELECT COUNT(*) FROM staff WHERE tenant_id = $1 AND employment_status = 'active'", [tenantId]),
      this.db.query(
        // "On leave" = distinct staff whose approved leave is active today OR
        // begins within the next 7 days. Counting a small window (not just the
        // exact current date) keeps the KPI meaningful instead of reading 0
        // whenever nobody happens to be off on precisely today.
        `SELECT COUNT(DISTINCT lr.staff_id) FROM leave_requests lr
         JOIN staff s ON s.id = lr.staff_id
         WHERE s.tenant_id = $1 AND lr.status = 'approved'
           AND lr.start_date <= CURRENT_DATE + INTERVAL '7 days'
           AND lr.end_date >= CURRENT_DATE`,
        [tenantId],
      ),
      this.db.query(
        `SELECT COUNT(*) FROM attendance_records ar
         JOIN staff s ON s.id = ar.staff_id
         WHERE s.tenant_id = $1 AND ar.date = CURRENT_DATE AND ar.status = 'present'`,
        [tenantId],
      ),
    ]);

    return {
      data: {
        totalOutlets: parseInt(outlets.rows[0].count),
        activeStaff: parseInt(staff.rows[0].count),
        staffOnLeaveToday: parseInt(activeLeave.rows[0].count),
        presentToday: parseInt(todayAttendance.rows[0].count),
        attendanceRate: staff.rows[0].count > 0
          ? Math.round((parseInt(todayAttendance.rows[0].count) / parseInt(staff.rows[0].count)) * 100)
          : 0,
      },
    };
  }

  async getOutletKpis(tenantId: string, outletId: string, startDate: string, endDate: string) {
    const [coverage, labor, attendance, pendingLeave] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(ss.id) AS total_shifts,
           COUNT(ss.id) FILTER (WHERE assigned.cnt >= ss.min_staff) AS covered_shifts,
           ROUND(COUNT(ss.id) FILTER (WHERE assigned.cnt >= ss.min_staff)::numeric / NULLIF(COUNT(ss.id),0) * 100, 1) AS coverage_pct
         FROM schedule_shifts ss
         JOIN schedules sc ON sc.id = ss.schedule_id AND sc.outlet_id = $1
         LEFT JOIN (
           SELECT shift_id, COUNT(*) AS cnt FROM shift_assignments WHERE status != 'cancelled' GROUP BY shift_id
         ) assigned ON assigned.shift_id = ss.id
         WHERE ss.outlet_id = $1 AND ss.date BETWEEN $2 AND $3`,
        [outletId, startDate, endDate],
      ),
      this.db.query(
        `SELECT
           COALESCE(SUM(ar.regular_hours * s.hourly_rate), 0) AS regular_cost,
           COALESCE(SUM(ar.overtime_hours * s.hourly_rate * 1.5), 0) AS overtime_cost,
           COALESCE(SUM((ar.regular_hours + ar.overtime_hours) * s.hourly_rate), 0) AS total_cost,
           COALESCE(SUM(ar.regular_hours + ar.overtime_hours), 0) AS total_hours
         FROM attendance_records ar
         JOIN staff s ON s.id = ar.staff_id
         WHERE ar.outlet_id = $1 AND ar.date BETWEEN $2 AND $3`,
        [outletId, startDate, endDate],
      ),
      this.db.query(
        `SELECT
           COUNT(*) AS total_records,
           COUNT(*) FILTER (WHERE status = 'present') AS present,
           COUNT(*) FILTER (WHERE status = 'absent') AS absent,
           COUNT(*) FILTER (WHERE status = 'late') AS late,
           ROUND(COUNT(*) FILTER (WHERE status = 'present')::numeric / NULLIF(COUNT(*),0) * 100, 1) AS attendance_rate
         FROM attendance_records
         WHERE outlet_id = $1 AND date BETWEEN $2 AND $3`,
        [outletId, startDate, endDate],
      ),
      this.db.query(
        `SELECT COUNT(*) AS pending_leave_count
         FROM leave_requests lr
         JOIN staff s ON s.id = lr.staff_id
         WHERE s.current_outlet_id = $1 AND lr.status = 'pending'`,
        [outletId],
      ),
    ]);

    return {
      data: {
        coverage: coverage.rows[0],
        labor: labor.rows[0],
        attendance: attendance.rows[0],
        pendingLeaveRequests: parseInt(pendingLeave.rows[0].pending_leave_count),
      },
    };
  }

  async getStaffHierarchy(tenantId: string, outletId?: string, departmentId?: string) {
    const conditions = ["s.tenant_id = $1", "s.employment_status = 'active'"];
    const params: unknown[] = [tenantId];
    let i = 2;
    if (outletId)     { conditions.push(`s.current_outlet_id = $${i++}`); params.push(outletId); }
    if (departmentId) { conditions.push(`s.department_id = $${i++}`);     params.push(departmentId); }

    const result = await this.db.query(
      `SELECT
         s.id, s.name, s.employee_id, s.employment_type, s.employment_status,
         p.name AS position_name, p.id AS position_id,
         d.name AS department_name, d.id AS department_id,
         o.name AS outlet_name, o.id AS outlet_id,
         -- Hierarchy level inferred from position name
         CASE
           WHEN p.name ILIKE '%head chef%' OR p.name ILIKE '%head of%' OR p.name ILIKE '%manager%' THEN 1
           WHEN p.name ILIKE '%chef de partie%' OR p.name ILIKE '%supervisor%' OR p.name ILIKE '%lead%' THEN 2
           WHEN p.name ILIKE '%cook%' OR p.name ILIKE '%chef%' THEN 3
           ELSE 4
         END AS hierarchy_level,
         -- Today's shift
         (SELECT st.name FROM schedule_shifts ss
          JOIN shift_assignments sa ON sa.shift_id = ss.id AND sa.staff_id = s.id
          LEFT JOIN shift_templates st ON st.id = ss.template_id
          WHERE ss.date = CURRENT_DATE AND sa.status != 'cancelled'
          LIMIT 1) AS todays_shift
       FROM staff s
       LEFT JOIN positions p ON p.id = s.position_id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN outlets o ON o.id = s.current_outlet_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY o.name, d.name, hierarchy_level, s.name`,
      params,
    );
    return { data: result.rows };
  }

  async getOutletStaffBreakdown(tenantId: string) {
    const result = await this.db.query(
      `SELECT
         o.id AS outlet_id, o.name AS outlet_name, o.code AS outlet_code,
         COUNT(s.id) AS total_staff,
         COUNT(s.id) FILTER (WHERE s.employment_type = 'full_time') AS full_time,
         COUNT(s.id) FILTER (WHERE s.employment_type = 'part_time') AS part_time,
         COUNT(DISTINCT d.id) AS departments,
         COUNT(lr.id) FILTER (WHERE lr.status = 'pending') AS pending_leaves
       FROM outlets o
       LEFT JOIN staff s ON s.current_outlet_id = o.id AND s.employment_status = 'active' AND s.tenant_id = $1
       LEFT JOIN departments d ON d.outlet_id = o.id
       LEFT JOIN leave_requests lr ON lr.staff_id = s.id
       WHERE o.tenant_id = $1 AND o.is_active = true
       GROUP BY o.id, o.name, o.code
       ORDER BY o.name`,
      [tenantId],
    );
    return { data: result.rows };
  }

  async getTodaySnapshot(tenantId: string) {
    const [staffOnShift, pendingLeave, pendingApprovals] = await Promise.all([
      this.db.query(
        `SELECT COUNT(DISTINCT sa.staff_id) AS staff_on_shift
         FROM shift_assignments sa
         JOIN schedule_shifts ss ON ss.id = sa.shift_id AND ss.date = CURRENT_DATE
         JOIN staff s ON s.id = sa.staff_id AND s.tenant_id = $1
         WHERE sa.status != 'cancelled'`,
        [tenantId],
      ),
      this.db.query(
        `SELECT COUNT(*) AS pending FROM leave_requests lr
         JOIN staff s ON s.id = lr.staff_id AND s.tenant_id = $1
         WHERE lr.status = 'pending'`,
        [tenantId],
      ),
      this.db.query(
        "SELECT COUNT(*) AS pending FROM users WHERE tenant_id = $1 AND pending_approval = true",
        [tenantId],
      ),
    ]);
    return {
      data: {
        staffOnShift: parseInt(staffOnShift.rows[0].staff_on_shift),
        pendingLeave: parseInt(pendingLeave.rows[0].pending),
        pendingApprovals: parseInt(pendingApprovals.rows[0].pending),
      },
    };
  }

  async getStaffPerformance(outletId: string, startDate: string, endDate: string) {
    const result = await this.db.query(
      `SELECT
         s.id, s.name, s.employee_id, p.name AS position_name,
         COUNT(ar.id) AS total_days,
         COUNT(ar.id) FILTER (WHERE ar.status = 'present') AS present_days,
         COUNT(ar.id) FILTER (WHERE ar.status = 'late') AS late_days,
         COALESCE(SUM(ar.overtime_hours), 0) AS overtime_hours,
         ROUND(COUNT(ar.id) FILTER (WHERE ar.status = 'present')::numeric / NULLIF(COUNT(ar.id),0) * 100, 1) AS attendance_rate
       FROM staff s
       LEFT JOIN attendance_records ar ON ar.staff_id = s.id AND ar.date BETWEEN $2 AND $3
       LEFT JOIN positions p ON p.id = s.position_id
       WHERE s.current_outlet_id = $1 AND s.employment_status = 'active'
       GROUP BY s.id, s.name, s.employee_id, p.name
       ORDER BY attendance_rate DESC`,
      [outletId, startDate, endDate],
    );
    return { data: result.rows };
  }

  async getLaborCostTrend(outletId: string, startDate: string, endDate: string) {
    const result = await this.db.query(
      `SELECT
         DATE_TRUNC('week', ar.date)::date AS week,
         COALESCE(SUM((ar.regular_hours + ar.overtime_hours) * s.hourly_rate), 0) AS labor_cost,
         COALESCE(SUM(ar.regular_hours + ar.overtime_hours), 0) AS total_hours
       FROM attendance_records ar
       JOIN staff s ON s.id = ar.staff_id
       WHERE ar.outlet_id = $1 AND ar.date BETWEEN $2 AND $3
       GROUP BY week ORDER BY week`,
      [outletId, startDate, endDate],
    );
    return { data: result.rows };
  }

  async getCoverageHeatmap(outletId: string, weekStartDate: string) {
    const result = await this.db.query(
      `SELECT
         ss.date,
         ss.start_time,
         ss.end_time,
         ss.min_staff,
         ss.target_staff,
         COALESCE(cnt.assigned, 0) AS assigned,
         CASE
           WHEN COALESCE(cnt.assigned, 0) >= ss.target_staff THEN 'full'
           WHEN COALESCE(cnt.assigned, 0) >= ss.min_staff THEN 'partial'
           ELSE 'understaffed'
         END AS coverage_level
       FROM schedule_shifts ss
       JOIN schedules sc ON sc.id = ss.schedule_id AND sc.week_start_date = $2
       LEFT JOIN (
         SELECT shift_id, COUNT(*) AS assigned
         FROM shift_assignments WHERE status != 'cancelled' GROUP BY shift_id
       ) cnt ON cnt.shift_id = ss.id
       WHERE ss.outlet_id = $1
       ORDER BY ss.date, ss.start_time`,
      [outletId, weekStartDate],
    );
    return { data: result.rows };
  }
}
