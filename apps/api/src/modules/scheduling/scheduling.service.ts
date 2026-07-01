import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
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
    // Load manual per-staff pins BEFORE opening the transaction. A failed query
    // inside a transaction aborts it in Postgres ("current transaction is
    // aborted"), so if staff_shift_overrides is missing (migration 011 not yet
    // applied) this read must NOT run inside the txn — it stays outside and
    // degrades to "no pins" on error, keeping core rotation working.
    let pinRows: { staff_id: string; template_id: string }[] = [];
    try {
      const pins = await this.db.query(
        `SELECT staff_id, template_id FROM staff_shift_overrides
         WHERE outlet_id = $1 AND tenant_id = $2 AND effective_from <= $3`,
        [outletId, tenantId, weekStartDate],
      );
      pinRows = pins.rows;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("staff_shift_overrides unavailable — skipping manual pins:", (err as Error).message);
    }

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
        // `, id` is a deterministic tie-breaker so the 3 rostered templates are
        // stable week-to-week and match the client's target list even when two
        // templates share a start_time.
        "SELECT * FROM shift_templates WHERE outlet_id = $1 AND is_active = true ORDER BY start_time, id LIMIT 3",
        [outletId],
      );
      if (tmplResult.rows.length === 0) throw new BadRequestException("No shift templates configured for this outlet — add shift templates before generating a roster.");
      const templates = tmplResult.rows; // [A, B, C]

      // 3. Get active staff for this outlet, sorted consistently
      const staffResult = await client.query(
        `SELECT id, employee_id, department_id FROM staff
         WHERE current_outlet_id = $1 AND employment_status = 'active' AND tenant_id = $2
         ORDER BY department_id NULLS LAST, employee_id`,
        [outletId, tenantId],
      );
      const staff = staffResult.rows;
      if (staff.length === 0) throw new BadRequestException("No active staff assigned to this outlet — assign staff before generating a roster.");

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

      // 6. Create schedule_shifts for each day × each shift template.
      //    Keyed by template id so a manual per-staff pin (below) can look up its
      //    target shift regardless of which rotation group normally gets it.
      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        days.push(d.toISOString().split("T")[0]);
      }

      const shiftByTemplateDay: Record<string, Record<string, string>> = {};
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
          if (!shiftByTemplateDay[tmpl.id]) shiftByTemplateDay[tmpl.id] = {};
          shiftByTemplateDay[tmpl.id][day] = ins.rows[0].id;
        }
      }

      // 7. Decide each staff member's target shift template for the week:
      //    default = their rotation group's template. A manual "pin" (a staff
      //    who was moved to a specific shift) overrides that, so the move
      //    survives the weekly rotation.
      const staffTemplateId: Record<string, string> = {};
      for (let g = 0; g < 3; g++) {
        for (const staffId of groups[g]) staffTemplateId[staffId] = groupShiftMap[g].id;
      }

      // Apply manual pins (loaded before the transaction). Only honour a pin for
      // staff actually rostered here this week and pointing at one of the 3
      // shifts in play, so an override can never orphan an assignment.
      const scheduledTemplateIds = new Set(templates.map((t: { id: string }) => t.id));
      for (const pin of pinRows) {
        if (staffTemplateId[pin.staff_id] && scheduledTemplateIds.has(pin.template_id)) {
          staffTemplateId[pin.staff_id] = pin.template_id;
        }
      }

      // 8. Assign each staff member to their target template's shift every day.
      for (const staffId of Object.keys(staffTemplateId)) {
        const dayMap = shiftByTemplateDay[staffTemplateId[staffId]];
        if (!dayMap) continue;
        for (const day of days) {
          const shiftId = dayMap[day];
          if (!shiftId) continue;
          await client.query(
            `INSERT INTO shift_assignments (shift_id, staff_id, status)
             VALUES ($1, $2, 'published')
             ON CONFLICT (shift_id, staff_id) DO UPDATE SET status='published'`,
            [shiftId, staffId],
          );
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
    const result = await this.autoGenerateRotation(tenantId, outletId, weekStartDate, userId);
    // Return the freshly-committed roster alongside the summary so the client can
    // render immediately — no fixed-delay refetch / timing race.
    const roster = await this.getWeeklyRoster(tenantId, outletId, weekStartDate);
    return { data: { generated: result.data, roster: roster.data } };
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
      // Same ordering (with `, id` tie-breaker) as autoGenerateRotation, so the
      // client's first-3 slice is exactly the set the rotation schedules.
      "SELECT * FROM shift_templates WHERE outlet_id = $1 AND is_active = true ORDER BY start_time, id",
      [outletId],
    );
    return { data: result.rows };
  }

  /**
   * Manually override a shift's start/end time (e.g. a chef adjusts Shift A).
   * Updates the template (so future auto-rotations use the new time) and, when
   * fromWeekStartDate is given, the already-generated shifts from that week
   * onward so the change is visible immediately. Past weeks stay as a record.
   */
  async updateShiftTemplate(
    tenantId: string,
    templateId: string,
    body: { startTime: string; endTime: string; breakMinutes?: number; fromWeekStartDate?: string },
  ) {
    const tmpl = await this.db.query(
      `SELECT st.*, o.tenant_id FROM shift_templates st
       JOIN outlets o ON o.id = st.outlet_id
       WHERE st.id = $1`,
      [templateId],
    );
    if (!tmpl.rows[0]) throw new NotFoundException("Shift template not found");
    if (tmpl.rows[0].tenant_id !== tenantId) throw new ForbiddenException("This shift template belongs to another tenant");

    const start = (body.startTime ?? "").slice(0, 5);
    const end = (body.endTime ?? "").slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      throw new BadRequestException("startTime and endTime must be in HH:MM (24-hour) format");
    }
    // An end at/before the start wraps past midnight (e.g. 15:00 → 00:00).
    const isOvernight = end <= start;

    // Keep the "(HH:MM–HH:MM)" suffix that the UI shows in sync with the times.
    const timeLabel = `(${start}–${end})`;
    const oldName: string = tmpl.rows[0].name;
    const newName = /\(.*\)/.test(oldName) ? oldName.replace(/\(.*\)/, timeLabel) : `${oldName} ${timeLabel}`;

    const breakMinutes = Number.isFinite(body.breakMinutes as number)
      ? body.breakMinutes
      : tmpl.rows[0].break_minutes;

    await this.db.query(
      `UPDATE shift_templates SET start_time = $2, end_time = $3, is_overnight = $4, name = $5, break_minutes = $6
       WHERE id = $1`,
      [templateId, start, end, isOvernight, newName, breakMinutes],
    );

    let updatedShifts = 0;
    if (body.fromWeekStartDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fromWeekStartDate)) {
        throw new BadRequestException("fromWeekStartDate must be YYYY-MM-DD");
      }
      const res = await this.db.query(
        `UPDATE schedule_shifts SET start_time = $2, end_time = $3, is_overnight = $4
         WHERE template_id = $1 AND date >= $5`,
        [templateId, start, end, isOvernight, body.fromWeekStartDate],
      );
      updatedShifts = res.rowCount ?? 0;
    }

    return { data: { id: templateId, name: newName, startTime: start, endTime: end, isOvernight, breakMinutes, updatedShifts } };
  }

  /**
   * Manually move ONE staff member onto a specific shift template (A→B, B→C,
   * C→A, or any target), from the given week onward.
   *   • Persists a per-staff "pin" (staff_shift_overrides) so future weekly
   *     auto-rotations keep this staff on the chosen shift.
   *   • Reassigns the already-generated shifts from weekStartDate onward so the
   *     change is visible immediately. Past weeks stay as a record.
   */
  async moveStaffToShift(
    tenantId: string,
    userId: string,
    body: { outletId: string; staffId: string; templateId: string; weekStartDate: string },
  ) {
    const { outletId, staffId, templateId, weekStartDate } = body ?? ({} as typeof body);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(outletId ?? "") || !uuid.test(staffId ?? "") || !uuid.test(templateId ?? "")) {
      throw new BadRequestException("outletId, staffId and templateId must be valid UUIDs");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate ?? "")) {
      throw new BadRequestException("weekStartDate must be YYYY-MM-DD");
    }

    // Target shift must be an active template of this outlet (and same tenant).
    const tmpl = await this.db.query(
      `SELECT st.id, st.name, o.tenant_id
       FROM shift_templates st JOIN outlets o ON o.id = st.outlet_id
       WHERE st.id = $1 AND st.outlet_id = $2 AND st.is_active = true`,
      [templateId, outletId],
    );
    if (!tmpl.rows[0]) throw new NotFoundException("Shift template not found for this outlet");
    if (tmpl.rows[0].tenant_id !== tenantId) throw new ForbiddenException("This shift belongs to another tenant");

    // Staff member must belong to this tenant and be based at this outlet.
    const stf = await this.db.query(
      "SELECT id, name FROM staff WHERE id = $1 AND tenant_id = $2 AND current_outlet_id = $3",
      [staffId, tenantId, outletId],
    );
    if (!stf.rows[0]) throw new NotFoundException("Staff member not found in this outlet");

    const client = await (this.db as Pool & { connect(): Promise<{ query: Pool["query"]; release(): void }> }).connect();
    try {
      await client.query("BEGIN");

      // 1. Persist the pin so future auto-rotations keep this staff on the shift.
      await client.query(
        `INSERT INTO staff_shift_overrides
           (tenant_id, staff_id, outlet_id, template_id, effective_from, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (staff_id) DO UPDATE SET
           template_id    = EXCLUDED.template_id,
           outlet_id      = EXCLUDED.outlet_id,
           effective_from = EXCLUDED.effective_from,
           updated_at     = NOW()`,
        [tenantId, staffId, outletId, templateId, weekStartDate, userId],
      );

      // 2. Move already-generated assignments (this week onward). Assign to the
      //    target shift FIRST; only cancel the staff's other shifts if the target
      //    actually has shifts in range, so we never strand them off the roster.
      const moved = await client.query(
        `INSERT INTO shift_assignments (shift_id, staff_id, status)
         SELECT ss.id, $1, 'published'
         FROM schedule_shifts ss
         WHERE ss.outlet_id = $2 AND ss.date >= $3 AND ss.template_id = $4
         ON CONFLICT (shift_id, staff_id) DO UPDATE SET status = 'published', updated_at = NOW()`,
        [staffId, outletId, weekStartDate, templateId],
      );

      if ((moved.rowCount ?? 0) > 0) {
        await client.query(
          `UPDATE shift_assignments sa
           SET status = 'cancelled', updated_at = NOW()
           FROM schedule_shifts ss
           WHERE sa.shift_id = ss.id
             AND sa.staff_id = $1
             AND ss.outlet_id = $2
             AND ss.date >= $3
             AND ss.template_id IS DISTINCT FROM $4
             AND sa.status <> 'cancelled'`,
          [staffId, outletId, weekStartDate, templateId],
        );
      }

      await client.query("COMMIT");

      // Return the refreshed roster so the client can render immediately.
      const roster = await this.getWeeklyRoster(tenantId, outletId, weekStartDate);
      return {
        data: {
          staffId,
          staffName: stf.rows[0].name,
          templateId,
          shiftName: tmpl.rows[0].name,
          movedShifts: moved.rowCount ?? 0,
          roster: roster.data,
        },
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      (client as { release(): void }).release();
    }
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
