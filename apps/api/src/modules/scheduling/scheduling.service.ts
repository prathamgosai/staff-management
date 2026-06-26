import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { Pool } from "pg";
import { DB_POOL } from "../../database/database.module";

// Week number from a fixed epoch for consistent rotation
function weekIndex(dateStr: string): number {
  const epoch = new Date("2024-01-01");
  const d = new Date(dateStr);
  return Math.floor((d.getTime() - epoch.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

@Injectable()
export class SchedulingService {
  constructor(
    @Inject(DB_POOL) private readonly db: Pool,
    @InjectQueue("auto-schedule") private readonly scheduleQueue: Queue,
  ) {}

  async getSchedule(tenantId: string, outletId: string, weekStartDate: string) {
    const schedResult = await this.db.query(
      `SELECT sc.*, COUNT(ss.id) AS shift_count
       FROM schedules sc
       LEFT JOIN schedule_shifts ss ON ss.schedule_id = sc.id
       WHERE sc.outlet_id = $1 AND sc.week_start_date = $2
       GROUP BY sc.id`,
      [outletId, weekStartDate],
    );

    if (!schedResult.rows[0]) return { data: null };

    const shifts = await this.db.query(
      `SELECT ss.*,
         COALESCE(json_agg(
           json_build_object(
             'id', sa.id, 'staffId', sa.staff_id, 'status', sa.status,
             'name', stf.name, 'employeeId', stf.employee_id, 'avatarUrl', stf.avatar_url,
             'positionName', p.name, 'departmentName', d.name
           )
         ) FILTER (WHERE sa.id IS NOT NULL), '[]') AS assignments
       FROM schedule_shifts ss
       LEFT JOIN shift_assignments sa ON sa.shift_id = ss.id
       LEFT JOIN staff stf ON stf.id = sa.staff_id
       LEFT JOIN positions p ON p.id = stf.position_id
       LEFT JOIN departments d ON d.id = stf.department_id
       WHERE ss.schedule_id = $1
       GROUP BY ss.id
       ORDER BY ss.date, ss.start_time`,
      [schedResult.rows[0].id],
    );

    return { data: { ...schedResult.rows[0], shifts: shifts.rows } };
  }

  /**
   * Auto-generate weekly schedule with 3-shift rotation (A→B→C→A each week).
   * Shifts: A=12:00-21:00, B=13:00-22:00, C=15:00-00:00
   * Staff are split into 3 groups by sort order. Each week they rotate.
   */
  async autoGenerateRotation(tenantId: string, outletId: string, weekStartDate: string, userId: string) {
    const client = await (this.db as Pool & { connect(): Promise<{ query: Pool["query"]; release(): void }> }).connect();
    try {
      await client.query("BEGIN");

      // 1. Get or create the schedule record
      let scheduleId: string;
      const existing = await client.query(
        "SELECT id FROM schedules WHERE outlet_id = $1 AND week_start_date = $2",
        [outletId, weekStartDate],
      );

      const weekStart = new Date(weekStartDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndDate = weekEnd.toISOString().split("T")[0];

      if (existing.rows[0]) {
        scheduleId = existing.rows[0].id;
        // Clear old shifts
        await client.query("DELETE FROM schedule_shifts WHERE schedule_id = $1", [scheduleId]);
        await client.query(
          "UPDATE schedules SET status='draft', auto_generated=true, created_by=$2 WHERE id=$1",
          [scheduleId, userId],
        );
      } else {
        const ins = await client.query(
          `INSERT INTO schedules (outlet_id, week_start_date, week_end_date, status, auto_generated, created_by)
           VALUES ($1, $2, $3, 'draft', true, $4) RETURNING id`,
          [outletId, weekStartDate, weekEndDate, userId],
        );
        scheduleId = ins.rows[0].id;
      }

      // 2. Get the 3 shift templates for this outlet (ordered by start_time)
      const tmplResult = await client.query(
        "SELECT * FROM shift_templates WHERE outlet_id = $1 AND is_active = true ORDER BY start_time LIMIT 3",
        [outletId],
      );
      if (tmplResult.rows.length === 0) throw new Error("No shift templates found for this outlet");
      const templates = tmplResult.rows; // [A, B, C]

      // 3. Get active staff for this outlet, sorted consistently
      const staffResult = await client.query(
        `SELECT id, employee_id, department_id FROM staff
         WHERE current_outlet_id = $1 AND employment_status = 'active' AND tenant_id = $2
         ORDER BY department_id NULLS LAST, employee_id`,
        [outletId, tenantId],
      );
      const staff = staffResult.rows;
      if (staff.length === 0) throw new Error("No active staff found for this outlet");

      // 4. Split staff into 3 rotation groups
      const groupSize = Math.ceil(staff.length / 3);
      const groups: string[][] = [
        staff.slice(0, groupSize).map((s: { id: string }) => s.id),
        staff.slice(groupSize, groupSize * 2).map((s: { id: string }) => s.id),
        staff.slice(groupSize * 2).map((s: { id: string }) => s.id),
      ];

      // 5. Determine rotation offset for this week (each week shifts by 1)
      const wk = weekIndex(weekStartDate);
      // groups[0] gets templates[(0 + wk) % 3], groups[1] gets [(1+wk)%3], etc.
      const groupShiftMap: Record<number, typeof templates[0]> = {
        0: templates[wk % 3],
        1: templates[(wk + 1) % 3],
        2: templates[(wk + 2) % 3],
      };

      // 6. Create schedule_shifts for each day × each shift template
      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        days.push(d.toISOString().split("T")[0]);
      }

      const shiftRows: Record<number, Record<string, string>> = { 0: {}, 1: {}, 2: {} };
      for (const day of days) {
        for (let g = 0; g < 3; g++) {
          const tmpl = groupShiftMap[g];
          const ins = await client.query(
            `INSERT INTO schedule_shifts
               (schedule_id, template_id, outlet_id, date, start_time, end_time,
                break_minutes, is_overnight, min_staff, target_staff, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published') RETURNING id`,
            [
              scheduleId, tmpl.id, outletId, day,
              tmpl.start_time, tmpl.end_time,
              tmpl.break_minutes, tmpl.is_overnight,
              tmpl.min_staff, tmpl.target_staff,
            ],
          );
          shiftRows[g][day] = ins.rows[0].id;
        }
      }

      // 7. Assign each staff member to their group's shift for every day
      for (let g = 0; g < 3; g++) {
        for (const staffId of groups[g]) {
          for (const day of days) {
            const shiftId = shiftRows[g][day];
            if (!shiftId) continue;
            await client.query(
              `INSERT INTO shift_assignments (shift_id, staff_id, status)
               VALUES ($1, $2, 'published')
               ON CONFLICT (shift_id, staff_id) DO UPDATE SET status='published'`,
              [shiftId, staffId],
            );
          }
        }
      }

      await client.query("COMMIT");

      return {
        data: {
          scheduleId,
          weekStartDate,
          weekEndDate,
          weekNumber: wk,
          rotationOffset: wk % 3,
          totalStaff: staff.length,
          groups: groups.map((g, i) => ({ group: ["A", "B", "C"][i], count: g.length, shift: groupShiftMap[i].name })),
        },
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      (client as { release(): void }).release();
    }
  }

  async triggerAutoGenerate(tenantId: string, outletId: string, weekStartDate: string, userId: string) {
    // Use direct rotation instead of queue
    return this.autoGenerateRotation(tenantId, outletId, weekStartDate, userId);
  }

  async publishSchedule(tenantId: string, scheduleId: string, userId: string) {
    const result = await this.db.query(
      `UPDATE schedules SET status = 'published', published_at = NOW(), published_by = $2
       WHERE id = $1 RETURNING *`,
      [scheduleId, userId],
    );
    if (!result.rows[0]) throw new NotFoundException("Schedule not found");
    return { data: result.rows[0] };
  }

  async getShifts(scheduleId?: string, outletId?: string, date?: string) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (scheduleId) { conditions.push(`ss.schedule_id = $${i++}`); params.push(scheduleId); }
    if (outletId)   { conditions.push(`ss.outlet_id = $${i++}`);   params.push(outletId); }
    if (date)       { conditions.push(`ss.date = $${i++}`);         params.push(date); }

    const result = await this.db.query(
      `SELECT ss.*, st.name AS shift_name, st.color AS shift_color, COUNT(sa.id) AS assigned_count
       FROM schedule_shifts ss
       LEFT JOIN shift_templates st ON st.id = ss.template_id
       LEFT JOIN shift_assignments sa ON sa.shift_id = ss.id AND sa.status != 'cancelled'
       ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
       GROUP BY ss.id, st.name, st.color
       ORDER BY ss.date, ss.start_time`,
      params,
    );
    return { data: result.rows };
  }

  async getTodayShifts(tenantId: string, outletId?: string, departmentId?: string) {
    const _now = new Date();
    const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
    const conditions = ["ss.date = $1"];
    const params: unknown[] = [today];
    let i = 2;
    if (outletId)     { conditions.push(`ss.outlet_id = $${i++}`);     params.push(outletId); }
    if (departmentId) { conditions.push(`sa.department_id = $${i++}`); params.push(departmentId); }

    const result = await this.db.query(
      `SELECT
         ss.id, ss.date, ss.start_time, ss.end_time, ss.outlet_id,
         st.name AS shift_name, st.color AS shift_color,
         o.name AS outlet_name,
         COALESCE(json_agg(
           json_build_object(
             'staffId', stf.id, 'name', stf.name, 'employeeId', stf.employee_id,
             'positionName', p.name, 'departmentName', d.name
           )
         ) FILTER (WHERE stf.id IS NOT NULL), '[]') AS staff
       FROM schedule_shifts ss
       LEFT JOIN shift_templates st ON st.id = ss.template_id
       LEFT JOIN outlets o ON o.id = ss.outlet_id
       LEFT JOIN shift_assignments sa ON sa.shift_id = ss.id AND sa.status != 'cancelled'
       LEFT JOIN staff stf ON stf.id = sa.staff_id
       LEFT JOIN positions p ON p.id = stf.position_id
       LEFT JOIN departments d ON d.id = stf.department_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY ss.id, st.name, st.color, o.name
       ORDER BY ss.start_time, o.name`,
      params,
    );
    return { data: result.rows };
  }

  async assignStaff(shiftId: string, staffIds: string[]) {
    const inserted = [];
    for (const staffId of staffIds) {
      const result = await this.db.query(
        `INSERT INTO shift_assignments (shift_id, staff_id, status)
         VALUES ($1, $2, 'published')
         ON CONFLICT (shift_id, staff_id) DO UPDATE SET status = 'published'
         RETURNING *`,
        [shiftId, staffId],
      );
      inserted.push(result.rows[0]);
    }
    return { data: inserted };
  }

  async removeAssignment(shiftId: string, staffId: string): Promise<void> {
    await this.db.query(
      "UPDATE shift_assignments SET status = 'cancelled' WHERE shift_id = $1 AND staff_id = $2",
      [shiftId, staffId],
    );
  }

  async getShiftTemplates(outletId: string) {
    const result = await this.db.query(
      "SELECT * FROM shift_templates WHERE outlet_id = $1 AND is_active = true ORDER BY start_time",
      [outletId],
    );
    return { data: result.rows };
  }

  async getCoverageSummary(outletId: string, weekStartDate: string) {
    const result = await this.db.query(
      `SELECT
         ss.date,
         COUNT(DISTINCT ss.id) AS total_shifts,
         SUM(ss.target_staff) AS total_target,
         COUNT(sa.id) AS total_assigned
       FROM schedule_shifts ss
       JOIN schedules sc ON sc.id = ss.schedule_id
       LEFT JOIN shift_assignments sa ON sa.shift_id = ss.id AND sa.status != 'cancelled'
       WHERE ss.outlet_id = $1 AND sc.week_start_date = $2
       GROUP BY ss.date
       ORDER BY ss.date`,
      [outletId, weekStartDate],
    );
    return { data: result.rows };
  }

  async getWeeklyRoster(tenantId: string, outletId: string, weekStartDate: string) {
    const result = await this.db.query(
      `SELECT
         ss.date, ss.start_time, ss.end_time, ss.is_overnight,
         st.name AS shift_name, st.color AS shift_color,
         stf.id AS staff_id, stf.name AS staff_name, stf.employee_id,
         p.name AS position_name, d.name AS department_name
       FROM schedule_shifts ss
       JOIN schedules sc ON sc.id = ss.schedule_id
         AND sc.outlet_id = $1 AND sc.week_start_date = $2
       LEFT JOIN shift_templates st ON st.id = ss.template_id
       LEFT JOIN shift_assignments sa ON sa.shift_id = ss.id AND sa.status != 'cancelled'
       LEFT JOIN staff stf ON stf.id = sa.staff_id
       LEFT JOIN positions p ON p.id = stf.position_id
       LEFT JOIN departments d ON d.id = stf.department_id
       ORDER BY ss.start_time, stf.name`,
      [outletId, weekStartDate],
    );

    // Group by shift_name → date → staff list
    const byShift: Record<string, {
      shiftName: string; shiftColor: string;
      startTime: string; endTime: string; isOvernight: boolean;
      dates: Record<string, { date: string; staff: { staffId: string; name: string; employeeId: string; positionName: string; departmentName: string }[] }>;
    }> = {};

    // postgres-date parses DATE columns as LOCAL midnight (not UTC).
    // Using toISOString() would shift the date one day back in IST (+5:30).
    // Use local date components instead.
    const toLocalDateStr = (d: Date | string): string => {
      if (d instanceof Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      return String(d).substring(0, 10);
    };

    for (const row of result.rows) {
      const sn = row.shift_name ?? "Unassigned";
      if (!byShift[sn]) {
        byShift[sn] = {
          shiftName: sn, shiftColor: row.shift_color,
          startTime: row.start_time, endTime: row.end_time, isOvernight: row.is_overnight,
          dates: {},
        };
      }
      const dateStr = toLocalDateStr(row.date);
      if (!byShift[sn].dates[dateStr]) byShift[sn].dates[dateStr] = { date: dateStr, staff: [] };
      if (row.staff_id) {
        byShift[sn].dates[dateStr].staff.push({
          staffId: row.staff_id, name: row.staff_name,
          employeeId: row.employee_id, positionName: row.position_name,
          departmentName: row.department_name,
        });
      }
    }

    return { data: Object.values(byShift) };
  }

  async requestSwap(userId: string, body: { requesterShiftId: string; targetStaffId?: string; targetShiftId?: string; reason?: string }) {
    const result = await this.db.query(
      `INSERT INTO shift_swap_requests (requester_id, requester_shift_id, target_staff_id, target_shift_id, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, body.requesterShiftId, body.targetStaffId ?? null, body.targetShiftId ?? null, body.reason ?? null],
    );
    return { data: result.rows[0] };
  }
}
